/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class SwitchControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Switch, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'active' || stateName === 'on' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    const valueType = typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'object' 
      ? typeof value as 'number' | 'boolean' | 'string' | 'object'
      : 'boolean';
    return { valueType };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'on',
        description: 'Turn on',
        commandType: 'pulse'
      },
      {
        name: 'off',
        description: 'Turn off',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'on' || command === 'off') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for Switch`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const state = statesToUse.find(s => s.name === 'active' || s.name === 'on');
    return `Switch (${state?.value ? 'ON' : 'OFF'})`;
  }
}