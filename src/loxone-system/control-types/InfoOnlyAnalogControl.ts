/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { extractUnit, formatLoxoneValue } from '../utils/index.js';

export class InfoOnlyAnalogControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.InfoOnlyAnalog, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // InfoOnlyAnalog controls are always numeric
    // Extract unit from Loxone's format string if available
    const format = this.control.details?.format;
    const unit = extractUnit(format);
    
    return {
      valueType: 'number',
      unit
    };
  }
  
  availableControlCommands(): ControlCommand[] {
    // InfoOnlyAnalog is read-only, no commands
    return [];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    throw new Error(`InfoOnlyAnalog controls are read-only and have no commands`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    
    // Try to find any state with a numeric value
    // Priority order: value, state, or first available state
    let valueState = statesToUse.find(s => s.name === 'value');
    if (!valueState) {
      valueState = statesToUse.find(s => s.name === 'state');
    }
    if (!valueState && statesToUse.length > 0) {
      // Use the first available state if no standard names found
      valueState = statesToUse[0];
    }
    
    if (valueState?.value !== undefined && valueState.value !== null) {
      const format = this.control.details?.format;
      const formattedValue = formatLoxoneValue(format, valueState.value);
      return `Info (${formattedValue})`;
    }
    
    return `Info (No data)`;
  }
}