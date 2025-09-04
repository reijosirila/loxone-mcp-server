/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class PushbuttonControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Pushbutton, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'active' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'boolean' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'pulse',
        description: 'Trigger the pushbutton',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'pulse') {
      return `jdev/sps/io/${this.uuid}/pulse`;
    }
    throw new Error(`Invalid command ${command} for Pushbutton`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const active = statesToUse.find(s => s.name === 'active');
    const status = active?.value ? 'ACTIVE' : 'IDLE';
    return `Pushbutton (${status})`;
  }
}