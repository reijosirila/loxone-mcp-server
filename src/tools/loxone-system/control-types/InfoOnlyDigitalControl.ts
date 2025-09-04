/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class InfoOnlyDigitalControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.InfoOnlyDigital, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // InfoOnlyDigital typically shows boolean states
    return { valueType: 'boolean' };
  }
  
  availableControlCommands(): ControlCommand[] {
    // InfoOnlyDigital is read-only, no commands
    return [];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    throw new Error(`InfoOnlyDigital controls are read-only and have no commands`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const state = statesToUse.find(s => s.name === 'value' || s.name === 'state' || s.name === 'active');
    
    let status = 'OFF';
    if (state?.value === true || state?.value === 1) {
      status = 'ON';
    } else if (state?.value === false || state?.value === 0) {
      status = 'OFF';
    } else if (state?.value !== undefined && state.value !== null) {
      status = state.value.toString();
    }
    
    return `Info (${status})`;
  }
}