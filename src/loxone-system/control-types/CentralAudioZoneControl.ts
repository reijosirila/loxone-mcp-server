/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class CentralAudioZoneControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.CentralAudioZone, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // Central controls don't have states, only linked controls
    return { valueType: 'string' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'play',
        description: 'Play all linked audio zones',
        commandType: 'pulse'
      },
      {
        name: 'pause',
        description: 'Pause all linked audio zones',
        commandType: 'pulse'
      },
      {
        name: 'volumeUp',
        description: 'Increase volume on all zones',
        commandType: 'pulse'
      },
      {
        name: 'volumeDown',
        description: 'Decrease volume on all zones',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    const validCommands = ['play', 'pause', 'volumeUp', 'volumeDown'];
    if (validCommands.includes(command)) {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for CentralAudioZone`);
  }
  
  generateSummary() {
    // Central controls don't have status
    const linkedCount = this.control.details?.controls?.length || 0;
    return `Central Audio (${linkedCount} zones)`;
  }
  
  // Override to not show states for central controls
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    // Filter out all states for central controls
    return true;
  }
}