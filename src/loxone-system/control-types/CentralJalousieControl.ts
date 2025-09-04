/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class CentralJalousieControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.CentralJalousie, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // Central controls don't have states
    return { valueType: 'string' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'fullUp',
        description: 'Move all blinds fully up',
        commandType: 'pulse'
      },
      {
        name: 'fullDown',
        description: 'Move all blinds fully down',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'fullUp' || command === 'fullDown') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for CentralJalousie`);
  }
  
  generateSummary() {
    const linkedCount = this.control.details?.controls?.length || 0;
    return `Central Jalousie (${linkedCount} blinds)`;
  }
  
  // Override to not show states for central controls
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    return true;
  }
}