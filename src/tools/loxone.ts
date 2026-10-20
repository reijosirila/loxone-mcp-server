import { z } from 'zod';
import { LoxoneSystem } from './loxone-system/index.js';
import {
  type LoxoneConfig,
  StatisticsPeriod
} from './loxone-system/types/structure.js';
import type { AbstractControlType } from './loxone-system/control-types/AbstractControlType.js';
import { ControlTypeFactory } from './loxone-system/control-types/ControlTypeFactory.js';
import type { StatisticsResponse } from './loxone-system/types/statistics.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Tool } from '../mcp-helpers/index.js';
import { toNumber } from './loxone-system/utils/index.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// Loxone needs a moment to push the new state over the WebSocket after a command
const STATE_REFRESH_DELAY_MS = 500;

export interface ControlSummary {
  uuid: string;
  name: string;
  type: string;
  room?: string;
  category?: string;
  summary: string;
  availableCommands: string[];
  hasStatistics: boolean;
}

export class LoxoneConnectionTools {
  private system: LoxoneSystem;

  constructor(config: Partial<LoxoneConfig>) {
    this.system = new LoxoneSystem(config);
  }

  public async open() {
    await this.system.open();
  }

  public async close() {
    await this.system.shutdown();
  }

  @Tool({
    title: 'Get system info',
    description: 'Get information about the Loxone Miniserver and this connection: project name, location, units, current operating mode, sunrise/sunset, Miniserver time, connection state and how many controls of each type exist. Call this first.',
    annotations: READ_ONLY,
  })
  public getSystemInfo() {
    this.isStructureLoaded();
    const structure = this.system.controlManager.getStructure();
    const connection = this.system.connectionManager.getConnectionInfo();
    const msInfo = structure?.msInfo;
    const globalStates = structure?.globalStates ?? {};
    const globalValue = (name: string) => {
      const uuid = globalStates[name];
      return uuid ? this.system.stateManager.getValue(uuid) : undefined;
    };
    const operatingModeId = toNumber(globalValue('operatingMode'));
    const operatingMode = operatingModeId === undefined
      ? undefined
      : structure?.operatingModes?.[String(operatingModeId)] ?? `mode ${operatingModeId}`;
    const typeCounts = this.system.controlManager.countControlsByType();
    const supportedTypes: Record<string, number> = {};
    const readOnlyGenericTypes: Record<string, number> = {};
    for (const [type, count] of Object.entries(typeCounts).sort(([a], [b]) => a.localeCompare(b))) {
      const bucket = ControlTypeFactory.isSupported({ type } as never) ? supportedTypes : readOnlyGenericTypes;
      bucket[type] = count;
    }
    return {
      miniserver: {
        name: msInfo?.msName,
        project: msInfo?.projectName,
        serialNumber: msInfo?.serialNr,
        location: msInfo?.location,
        temperatureUnit: msInfo?.tempUnit === 1 ? '°F' : '°C',
        currency: msInfo?.currency,
        currentUser: msInfo?.currentUser?.name,
        structureLastModified: structure?.lastModified,
      },
      now: {
        miniserverTime: globalValue('miniserverTime'),
        operatingMode,
        sunrise: minutesToClock(globalValue('sunrise')),
        sunset: minutesToClock(globalValue('sunset')),
        hasInternet: globalValue('hasInternet'),
      },
      connection,
      controls: {
        total: Object.keys(structure?.controls ?? {}).length,
        rooms: this.system.controlManager.getRooms().length,
        categories: this.system.controlManager.getCategories().length,
        byType: supportedTypes,
        readOnlyGenericByType: readOnlyGenericTypes,
      },
    };
  }

  @Tool({
    title: 'Get rooms',
    description: 'Get all rooms of the Smart Home with the number of controls in each room',
    annotations: READ_ONLY,
  })
  public getRooms() {
    this.isStructureLoaded();
    const counts = this.system.controlManager.countControlsByRoom();
    return this.system.controlManager.getRooms().map(room => ({ ...room, controlCount: counts[room.uuid] ?? 0 }));
  }

  @Tool({
    title: 'Get categories',
    description: 'Get all categories (e.g. Lighting, Shading, Heating) of the Smart Home with the number of controls in each',
    annotations: READ_ONLY,
  })
  public getCategories() {
    this.isStructureLoaded();
    const counts = this.system.controlManager.countControlsByCategory();
    return this.system.controlManager.getCategories().map(cat => ({ ...cat, controlCount: counts[cat.uuid] ?? 0 }));
  }

  @Tool({
    title: 'Find controls',
    description: 'List controls with optional filters. Returns a compact list (uuid, type, room, one-line state summary, command names). Use getControl for full details of one control.',
    inputSchema: {
      room: z.string().optional().describe('Room UUID or room name (case-insensitive)'),
      category: z.string().optional().describe('Category UUID or category name (case-insensitive)'),
      type: z.string().optional().describe('Control type, e.g. Switch, Dimmer, Jalousie, IRoomControllerV2, Meter'),
      search: z.string().optional().describe('Free text matched against control name, room, category and type'),
      detailed: z.boolean().optional().describe('Return full state and command details for every control instead of the compact list (large output)'),
    },
    annotations: READ_ONLY,
  })
  public getControls(args: { room?: string; category?: string; type?: string; search?: string; detailed?: boolean } = {}) {
    this.isStructureLoaded();
    const controls = this.system.controlManager.getControls({
      room: args.room,
      category: args.category,
      type: args.type,
      search: args.search,
    });
    if (args.detailed) {
      return controls;
    }
    return controls.map(control => this.summarize(control));
  }

  @Tool({
    title: 'Get control',
    description: 'Get one control with its current state values, available commands and their parameters.',
    inputSchema: {
      uuid: z.string().describe('Control UUID'),
    },
    annotations: READ_ONLY,
  })
  public getControl(args: { uuid: string }): AbstractControlType {
    this.isStructureLoaded();
    return this.system.controlManager.getControl(args.uuid);
  }

  @Tool({
    title: 'Send command',
    description: 'Send a command to a control (e.g. on, off, setValue, setTemperature, up, down). Use a command name from the control\'s availableCommands. Returns the Miniserver response and the refreshed control state.',
    inputSchema: {
      uuid: z.string().describe('Control UUID'),
      command: z.string().describe('Command name as listed in availableCommands'),
      value: z.union([z.string(), z.number(), z.boolean()]).optional().describe('Value for commands that require one (see the command\'s valueType, min, max, options)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  })
  public async setControl(args: { uuid: string; command: string; value?: string | number | boolean }) {
    const { uuid, command, value } = args;
    this.isConnected();
    this.isStructureLoaded();
    const result = await this.system.controlManager.setControl(uuid, command, value);
    const rejected = String(result.value) === '0';
    await new Promise(resolve => setTimeout(resolve, STATE_REFRESH_DELAY_MS));
    const control = this.system.controlManager.getControl(uuid);
    return {
      success: !rejected,
      message: rejected
        ? `The Miniserver answered '0' to '${command}', which usually means the command was rejected (control locked, value out of range or not permitted). Check the control state below.`
        : `Command '${command}' accepted by the Miniserver for '${control.name}'.`,
      miniserverResponse: { code: result.code, value: result.value },
      control: {
        uuid,
        name: control.name,
        type: control.getType(),
        room: control.room,
        summary: control.generateSummary(),
        currentStates: control.formattedStates,
      },
    };
  }

  @Tool({
    title: 'Get statistics',
    description: 'Get historical data for controls with statistics enabled (hasStatistics=true). Returns aggregated data for easy analysis.',
    inputSchema: {
      controlUuid: z.string().describe('Control UUID to get statistics for'),
      period: z.enum(StatisticsPeriod).describe('Time period to retrieve statistics for (ignored when from/to are provided)'),
      from: z.string().optional().describe('Optional ISO date/time for custom range start, e.g. 2026-07-11T02:00:00 (Miniserver local time unless an offset is given)'),
      to: z.string().optional().describe('Optional ISO date/time for custom range end (defaults to now)'),
      output: z.number().int().min(1).optional().describe('Optional output column (1-based) for multi-output statistics files'),
    },
    annotations: READ_ONLY,
  })
  public async getStatistics(args: { controlUuid: string; period: StatisticsPeriod; from?: string; to?: string; output?: number }): Promise<StatisticsResponse> {
    const { controlUuid, period, from, to, output } = args;
    this.isConnected();
    this.isStructureLoaded();
    this.system.statisticsService.setOutputColumn(output);
    return this.system.statisticsService.getStatistics(controlUuid, period, from, to);
  }

  @Tool({
    title: 'Reload structure',
    description: 'Reload the Loxone structure file from the Miniserver. Use after adding or renaming controls in Loxone Config so they become visible without restarting.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  })
  public async reloadStructure(): Promise<{ controls: number; message: string }> {
    // Deliberately not gated on the WebSocket state: the reload goes over HTTP with its own
    // credentials and is needed most while the WebSocket is still reconnecting after a deploy.
    const controls = await this.system.connectionManager.reloadStructure();
    return { controls, message: `Structure reloaded: ${controls} controls now visible.` };
  }

  private summarize(control: AbstractControlType): ControlSummary {
    return {
      uuid: control.getUuid(),
      name: control.name,
      type: control.getType(),
      room: control.room,
      category: control.category,
      summary: control.generateSummary(),
      availableCommands: control.availableControlCommands().map(c => c.name),
      hasStatistics: control.hasStatistics,
    };
  }

  private isConnected() {
    if (!this.system.connectionManager.isConnected()) {
      const info = this.system.connectionManager.getConnectionInfo();
      const detail = info.lastDisconnectReason ? ` Last disconnect reason: ${info.lastDisconnectReason}.` : '';
      throw new McpError(ErrorCode.ConnectionClosed, `Not connected to the Loxone Miniserver (state ${info.state}); reconnecting automatically.${detail} Try again shortly.`);
    }
  }

  private isStructureLoaded() {
    if (!this.system.connectionManager.isStructureLoaded()) {
      throw new McpError(ErrorCode.ConnectionClosed, 'Smart Home data is not loaded yet. Try again shortly.');
    }
  }
}

function minutesToClock(value: unknown): string | undefined {
  const minutes = toNumber(value);
  if (minutes === undefined) return undefined;
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
