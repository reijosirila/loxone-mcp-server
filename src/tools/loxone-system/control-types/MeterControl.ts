/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { extractUnit, formatLoxoneValue } from '../utils/index.js';

export class MeterControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Meter, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // Meter controls have specific format strings for actual and total
    let format: string | undefined;
    let unit: string | undefined;
    
    if (stateName === 'actual' || stateName === 'actualPower' || stateName === 'value') {
      format = this.control.details?.actualFormat as string | undefined;
      unit = format ? extractUnit(format) : 'kW';
    } else if (stateName === 'total' || stateName === 'totalEnergy') {
      format = this.control.details?.totalFormat as string | undefined;
      unit = format ? extractUnit(format) : 'kWh';
    } else {
      // For other states, try general format
      format = this.control.details?.format;
      unit = format ? extractUnit(format) : undefined;
      
      // Fallback defaults for common meter states
      if (!unit) {
        if (stateName === 'power') {
          unit = 'W';
        } else if (stateName === 'consumption') {
          unit = 'kWh';
        } else if (stateName === 'flow') {
          unit = 'l/min';
        }
      }
    }
    
    return {
      valueType: 'number',
      unit
    };
  }
  
  availableControlCommands(): ControlCommand[] {
    // Meters are read-only, no commands exposed
    return [];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    throw new Error(`Meter controls are read-only and have no commands`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const actualFormat = this.control.details?.actualFormat || '%.2fkW';
    const totalFormat = this.control.details?.totalFormat || '%.2fkWh';
    
    const actual = statesToUse.find(s => s.name === 'actual' || s.name === 'actualPower' || s.name === 'value');
    const total = statesToUse.find(s => s.name === 'total' || s.name === 'totalEnergy');
    const power = statesToUse.find(s => s.name === 'power');
    const flow = statesToUse.find(s => s.name === 'flow');
    
    let parts = [];
    
    if (actual?.value !== undefined) {
      const formatted = formatLoxoneValue(typeof actualFormat === 'string' ? actualFormat : '%.2fkW', actual.value);
      parts.push(formatted);
    } else if (power?.value !== undefined) {
      // Power might not have a specific format, use default
      const formatted = formatLoxoneValue('%.0fW', power.value);
      parts.push(formatted);
    } else if (flow?.value !== undefined) {
      // Flow might not have a specific format, use default
      const formatted = formatLoxoneValue('%.1fl/min', flow.value);
      parts.push(formatted);
    }
    
    if (total?.value !== undefined) {
      const formatted = formatLoxoneValue(typeof totalFormat === 'string' ? totalFormat : '%.2fkWh', total.value);
      parts.push(`Total: ${formatted}`);
    }
    
    const status = parts.length > 0 ? parts.join(', ') : 'No data';
    return `Meter (${status})`;
  }
}