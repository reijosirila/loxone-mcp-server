import { LoxoneSystem } from './loxone-system/index.js';
import {
  type LoxoneConfig,
  type Room,
  type Category,
  StatisticsPeriod
} from './loxone-system/types/structure.js';
import type { AbstractControlType } from './loxone-system/control-types/AbstractControlType.js';
import type { StatisticsResponse } from './loxone-system/types/statistics.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Tool } from '../mcp-helpers/index.js';

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
    description: 'Get all rooms from Smart Home',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  })
  public getRooms(): Room[] {
    this.isStructureLoaded();
    return this.system.controlManager.getRooms();
  }

  @Tool({
    description: 'Get all categories from Smart Home',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  })
  public getCategories(): Category[] {
    this.isStructureLoaded();
    return this.system.controlManager.getCategories();
  }

  @Tool({
    description: 'Get controls with optional room/category filter. Returns controls with their current state values and available commands.',
    inputSchema: {
      type: 'object',
      properties: {
        roomUuid: {
          type: 'string',
          description: 'Optional: Filter by room UUID',
        },
        categoryUuid: {
          type: 'string',
          description: 'Optional: Filter by category UUID',
        },
      },
      required: [],
    },
  })
  public getControls(args?: { roomUuid?: string | null; categoryUuid?: string | null }) {
    const { roomUuid, categoryUuid } = args || {};
    this.isStructureLoaded();
    return this.system.controlManager.getControls(roomUuid, categoryUuid);
  }

  @Tool({
    description: 'Get one Control. Returns control with their current state values and available commands.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Control UUID',
        },
      },
      required: ['uuid'],
    },
  })
  public getControl(args: { uuid: string }): AbstractControlType {
    const { uuid } = args;
    this.isStructureLoaded();
    return this.system.controlManager.getControl(uuid);
  }

  @Tool({
    description: 'Send a command to a control',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Control UUID',
        },
        command: {
          type: 'string',
          description: 'Command name (e.g., "on", "off", "setValue", "setTemperature")',
        },
        value: {
          type: ['string', 'number', 'boolean'],
          description: 'Optional value for commands that require it',
        },
      },
      required: ['uuid', 'command'],
    },
  })
  public async setControl(args: { uuid: string; command: string; value?: unknown }) {
    const { uuid, command, value } = args;
    this.isConnected();
    this.isStructureLoaded();
    const success = await this.system.controlManager.setControl(uuid, command, value);
    return {
      success,
      message: success ? 
        `Command '${command}' sent successfully to control ${uuid}` : 
        `Failed to send command '${command}' to control ${uuid}`
    };
  }

  @Tool({
    description: 'Get historical data for controls with statistics enabled. Returns aggregated data for easy analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        controlUuid: {
          type: 'string',
          description: 'Control UUID to get statistics for',
        },
        period: {
          type: 'string',
          enum: Object.values(StatisticsPeriod),
          description: 'Time period to retrieve statistics for',
        },
      },
      required: ['controlUuid', 'period'],
    },
  })
  public async getStatistics(args: { controlUuid: string; period: StatisticsPeriod }): Promise<StatisticsResponse> {
    const { controlUuid, period } = args;
    this.isConnected();
    this.isStructureLoaded();
    return this.system.statisticsService.getStatistics(controlUuid, period);
  }
  
  private isConnected() {
    if (!this.system.connectionManager.isConnected()) {
    throw new McpError(ErrorCode.ConnectionClosed, 'Not connected to Loxone. Try again later.')
    }
  }
  
  private isStructureLoaded() {
    if (!this.system.connectionManager.isStructureLoaded()) {
      throw new McpError(ErrorCode.ConnectionClosed, 'Tool has not loaded the Smart Home data yet. Try again later.')
    }
  }
}