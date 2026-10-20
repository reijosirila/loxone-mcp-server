import { injectable } from 'tsyringe';
import { type StructureFile, type Room, type Category } from '../types/structure.js';
import { AbstractControlType } from '../control-types/AbstractControlType.js';
import { ControlTypeFactory } from '../control-types/ControlTypeFactory.js';
import { ConnectionManager } from './ConnectionManager.js';
import { StateManager } from './StateManager.js';
import { Logger } from '../../../utils/Logger.js';
import { isLoxoneControl, type LoxoneControl } from '../types/control-structure.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface ControlFilter {
  /** Room UUID or (case-insensitive) room name */
  room?: string | null;
  /** Category UUID or (case-insensitive) category name */
  category?: string | null;
  /** Loxone control type, e.g. "Switch" */
  type?: string | null;
  /** Case-insensitive substring matched against control name, room, category and type */
  search?: string | null;
}

export interface SetControlResult {
  /** Code returned by the Miniserver (200 = command accepted) */
  code?: number;
  /** Raw value from the Miniserver response; "0" usually means the command was rejected */
  value?: unknown;
  command: string;
}

/**
 * ControlManager turns the structure file into control instances, applies filters
 * and executes commands. Every control in the structure is exposed: types without a
 * dedicated class fall back to GenericControl (read-only).
 */
@injectable()
export class ControlManager  {
  private structure: StructureFile | null = null;

  constructor(
    private readonly connection: ConnectionManager,
    private readonly stateManager: StateManager,
    private readonly logger: Logger
  ) {
  }

  public updateStructure(structure: StructureFile | null): void {
    this.structure = structure;
  }

  public getStructure(): StructureFile | null {
    return this.structure;
  }

  public getRooms(): Room[] {
    if (!this.structure) return [];
    return Object.entries(this.structure.rooms).map(([uuid, room]) => ({
      uuid,
      name: room.name
    }));
  }

  public getCategories(): Category[] {
    if (!this.structure) return [];
    return Object.entries(this.structure.cats).map(([uuid, cat]) => ({
      uuid,
      name: cat.name,
      type: cat.type
    }));
  }

  public countControlsByRoom(): Record<string, number> {
    return this.countBy(control => control.room);
  }

  public countControlsByCategory(): Record<string, number> {
    return this.countBy(control => control.cat);
  }

  public countControlsByType(): Record<string, number> {
    return this.countBy(control => String(control.type));
  }

  private countBy(key: (control: LoxoneControl) => string | undefined): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const control of Object.values(this.structure?.controls ?? {})) {
      if (!isLoxoneControl(control)) continue;
      const k = key(control);
      if (!k) continue;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }

  public getControls(filter: ControlFilter = {}): AbstractControlType[] {
    if (!this.structure) return [];
    this.logger.debug('ControlManager', 'Getting controls', filter);
    const roomUuid = filter.room ? this.resolveRoomUuid(filter.room) : undefined;
    const categoryUuid = filter.category ? this.resolveCategoryUuid(filter.category) : undefined;
    const typeFilter = filter.type?.trim().toLowerCase();
    const search = filter.search?.trim().toLowerCase();
    const controls: AbstractControlType[] = [];

    for (const [uuid, control] of Object.entries(this.structure.controls)) {
      if (!isLoxoneControl(control)) {
        this.logger.debug('ControlManager', `Skipping malformed control: ${uuid}`);
        continue;
      }
      if (roomUuid && control.room !== roomUuid) continue;
      if (categoryUuid && control.cat !== categoryUuid) continue;
      if (typeFilter && String(control.type).toLowerCase() !== typeFilter) continue;
      const instance = this.createControl(uuid, control);
      if (search) {
        const haystack = [instance.name, instance.room, instance.category, String(control.type)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }
      controls.push(instance);
    }
    return controls;
  }

  public getControl(uuid: string): AbstractControlType {
    if (!this.structure) {
      throw new McpError(ErrorCode.ConnectionClosed, 'Connecting to Smart Home. Try again later.');
    }
    const control = this.structure.controls[uuid];
    if (!control) {
      throw new McpError(ErrorCode.InvalidParams, `Control ${uuid} not found. Use getControls with a search term to find the right UUID.`);
    }
    return this.createControl(uuid, control);
  }

  public async setControl(uuid: string, command: string, value?: unknown): Promise<SetControlResult> {
    if (!this.connection.isConnected()) {
      throw new McpError(ErrorCode.ConnectionClosed, 'Not connected to Loxone');
    }
    if (!this.structure) {
      throw new McpError(ErrorCode.ConnectionClosed, 'Connecting to Smart Home. Try again later.');
    }
    const control = this.structure.controls[uuid];
    if (!control) {
      throw new McpError(ErrorCode.InvalidParams, `Control ${uuid} not found. Use getControls with a search term to find the right UUID.`);
    }
    const instance = ControlTypeFactory.create(uuid, control, this.structure, this.stateManager.getAll());
    let cmd: string;
    try {
      cmd = instance.buildControlCommand(command, value);
    } catch (error) {
      const available = instance.availableControlCommands().map(c => c.name);
      const reason = error instanceof Error ? error.message : String(error);
      const hint = available.length
        ? `Available commands for ${instance.getType()} '${instance.name}': ${available.join(', ')}`
        : `${instance.getType()} '${instance.name}' accepts no commands`;
      throw new McpError(ErrorCode.InvalidParams, `${reason}. ${hint}`);
    }
    this.logger.info('ControlManager', `Sending command: ${cmd}`);
    const response = await this.connection.sendCommand(cmd);
    const code = response?.code;
    if (code !== 200) {
      throw new Error(`Miniserver rejected '${command}' for '${instance.name}' (code ${code ?? 'unknown'}${this.describeCode(code)})`);
    }
    return { code, value: response?.value, command: cmd };
  }

  private describeCode(code?: number): string {
    switch (code) {
      case 401:
      case 403: return ': the configured Loxone user is not allowed to operate this control';
      case 404: return ': the Miniserver does not know this control, try reloadStructure';
      case 503: return ': the Miniserver is busy or rebooting';
      default: return '';
    }
  }

  private resolveRoomUuid(value: string): string {
    const rooms = this.structure?.rooms ?? {};
    const uuid = this.resolveByUuidOrName(rooms, value);
    if (!uuid) {
      const names = Object.values(rooms).map(r => r.name).sort().join(', ');
      throw new McpError(ErrorCode.InvalidParams, `Room '${value}' not found. Available rooms: ${names}`);
    }
    return uuid;
  }

  private resolveCategoryUuid(value: string): string {
    const cats = this.structure?.cats ?? {};
    const uuid = this.resolveByUuidOrName(cats, value);
    if (!uuid) {
      const names = Object.values(cats).map(c => c.name).sort().join(', ');
      throw new McpError(ErrorCode.InvalidParams, `Category '${value}' not found. Available categories: ${names}`);
    }
    return uuid;
  }

  private resolveByUuidOrName(entries: Record<string, { name: string }>, value: string): string | undefined {
    const trimmed = value.trim();
    if (entries[trimmed]) return trimmed;
    const lower = trimmed.toLowerCase();
    const exact = Object.entries(entries).find(([, e]) => e.name.toLowerCase() === lower);
    if (exact) return exact[0];
    const partial = Object.entries(entries).filter(([, e]) => e.name.toLowerCase().includes(lower));
    return partial.length === 1 ? partial[0][0] : undefined;
  }

  private createControl(uuid: string, control: LoxoneControl): AbstractControlType {
    if (!this.structure) {
      throw new Error(`Structure not loaded to initialize control type: ${control.type}`);
    }
    return ControlTypeFactory.create(uuid, control, this.structure, this.stateManager.getAll());
  }
}
