import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { extractUnit } from '../utils/index.js';

export class GenericControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, type: ControlType, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, type, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // For unknown types, make best guess based on value type and name
    
    // Try to get unit from Loxone's format string first
    const format = this.control.details?.format;
    const unit = extractUnit(format);
    
    // Temperature states
    if (stateName.toLowerCase().includes('temp')) {
      return {
        valueType: 'number',
        unit: unit || '°C',
      };
    }
    
    // Humidity states  
    if (stateName.toLowerCase().includes('humid')) {
      return {
        valueType: 'number',
        unit: unit || '%',
      };
    }
    
    // Position/value states
    if (stateName === 'value' || stateName === 'position') {
      return {
        valueType: 'number',
        unit,
      };
    }
    
    // Boolean states
    if (stateName === 'active' || stateName === 'on' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    
    // Default to type of actual value with any extracted unit
    return { 
      valueType: typeof value as any || 'string',
      unit
    };
  }
  
  availableControlCommands(): ControlCommand[] {
    const commands: ControlCommand[] = [];
    return commands;
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'pulse') {
      return `jdev/sps/io/${this.uuid}/pulse`;
    } else if (command === 'setValue' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/${value}`;
    }
    throw new Error(`Unknown command ${command} for control type ${this.type}`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    
    // For unknown/new control types, show the type name and basic state info
    const typeStr = (this.type === ControlType.Unknown || !this.type) ? 'Unknown Type' : this.type.toString();
    
    // Look for the most relevant state
    const active = statesToUse.find(s => s.name === 'active' || s.name === 'on');
    const value = statesToUse.find(s => s.name === 'value');
    const state = statesToUse.find(s => s.name === 'state');
    const position = statesToUse.find(s => s.name === 'position');
    
    let status = '';
    if (active !== undefined) {
      status = active.value ? 'ON' : 'OFF';
    } else if (value?.value !== undefined && value !== null) {
      status = `${value.value}${value.unit || ''}`;
    } else if (position?.value !== undefined && value !== null) {
      status = `${position.value}%`;
    } else if (state?.value !== undefined && state.value !== null) {
      status = String(state.value);
    } else if (statesToUse.length > 0) {
      // Show the first available state
      const firstState = statesToUse[0];
      status = `${firstState.name}: ${firstState.value}`;
    } else {
      status = 'No state';
    }
    
    return `${typeStr} (${status})`;
  }
}