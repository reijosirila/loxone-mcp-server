import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import { extractUnit, formatLoxoneValue } from '../utils/index.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class SliderControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Slider, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'value') {
      const format = this.control.details?.format;      
      const unit = extractUnit(format);
      return {
        valueType: 'number',
        unit,
      };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    const min = this.control.details?.min || 0;
    const max = this.control.details?.max || 100;
    const step = this.control.details?.step || 1;    
    return [
      {
        name: 'setValue',
        description: `Set value (${min}-${max})`,
        commandType: 'setValue',
        valueType: 'number',
        min,
        max,
        step
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'setValue' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/${value}`;
    }
    throw new Error(`Invalid command ${command} for Slider`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const value = statesToUse.find(s => s.name === 'value');
    const format = this.control.details?.format;
    
    if (value?.value !== undefined && value.value !== null) {
      const formattedValue = formatLoxoneValue(format, value.value);
      return `Slider (${formattedValue})`;
    }
    
    return `Slider (?)`;
  }
}