import { injectable } from 'tsyringe';
import { type StructureFile, type Room, type Category } from '../types/structure.js';
import { AbstractControlType } from '../control-types/AbstractControlType.js';
import { ControlTypeFactory } from '../control-types/ControlTypeFactory.js';
import { ConnectionManager } from './ConnectionManager.js';
import { StateManager } from './StateManager.js';
import { Logger } from '../../../utils/Logger.js';
import { isLoxoneControl } from '../types/control-structure.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * ControlManager manages Loxone control devices and their interactions.
 * 
 * Responsibilities:
 * - Manages the structure file containing all Loxone controls, rooms, and categories
 * - Provides access to rooms and categories information
 * - Creates and manages control type instances using the factory pattern
 * - Filters and retrieves controls by various criteria (room, category, type)
 * - Executes control commands (pulse, on, off, value changes)
 * - Retrieves current control states and detailed information
 * - Handles control type-specific operations through AbstractControlType implementations
 * - Filters out unsupported control types using ControlTypeFactory.isSupported
 * 
 * This service acts as the main interface for interacting with Loxone devices.
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

  public getControls(roomUuid?: string | null, categoryUuid?: string | null): AbstractControlType[] {
    if (!this.structure) return [];
    this.logger.debug('ControlManager', 'Getting controls');
    const controls: AbstractControlType[] = [];
    
    for (const [uuid, control] of Object.entries(this.structure.controls)) {
      // Skip unsupported control types
      if (!isLoxoneControl(control) || !ControlTypeFactory.isSupported(control)) {
        this.logger.warn('ControlManager', `Skipping unsupported control: ${uuid}`, control);
        continue;
      }

      // Apply filters
      if (roomUuid && control.room !== roomUuid) continue;
      if (categoryUuid && control.cat !== categoryUuid) continue;
      this.logger.debug('ControlManager', `Processing control: ${uuid}`, control);

      // Build control with states and commands
      const processedControl = this.createControl(uuid, control);
      if (processedControl) {
        controls.push(processedControl);
      }
    }
    
    return controls;
  }

  public getControl(uuid: string): AbstractControlType {
    if (!this.structure) {
      throw new McpError(ErrorCode.ConnectionClosed,'Connecting to Smart Home. Try again later.');
    }
    const control = this.structure.controls[uuid];
    if (!control) {
      throw new Error(`Control ${uuid} not found`);
    }
    
    return this.createControl(uuid, control);
  }

  public async setControl(uuid: string, command: string, value?: unknown): Promise<boolean> {
    if (!this.connection.isConnected()) {
      throw new McpError(ErrorCode.ConnectionClosed, 'Not connected to Loxone');
    }
    if (!this.structure) {
      throw new McpError(ErrorCode.ConnectionClosed,'Connecting to Smart Home. Try again later.');
    }
    const control = this.structure.controls[uuid];
    if (!control) {
      throw new McpError(ErrorCode.MethodNotFound,`Control ${uuid} not found`);
    }
    try {
      // Create control type instance and build command
      const controlInstance = ControlTypeFactory.create(uuid, control, this.structure, new Map());
      const cmd = controlInstance.buildControlCommand(command, value);
      this.logger.info('ControlManager', `Sending command: ${cmd}`);
      const response = await this.connection.sendCommand(cmd);
      return response?.code === 200;
    } catch (error) {
      this.logger.error('ControlManager', 'Command failed:', error);
      throw error;
    }
  }

  private createControl(uuid: string, control: unknown): AbstractControlType {
    // Create control instance with state from StateManager
    const stateCache = this.stateManager.getAll();
    if (!this.structure) { // cannot happen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Structure not loaded to initialize control type: ${(control as any)?.type}`);
    }
    if (isLoxoneControl(control)) {
      return ControlTypeFactory.create(uuid, control, this.structure, stateCache);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unsupported control type: ${(control as any)?.type}`);
    }
  }
}