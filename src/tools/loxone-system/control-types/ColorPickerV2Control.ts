 
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class ColorPickerV2Control extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.ColorPickerV2, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'color' || stateName === 'hsv') {
      return { valueType: 'string' };
    }
    if (stateName === 'brightness' || stateName === 'value') {
      return {
        valueType: 'number',
        unit: '%',
      };
    }
    if (stateName === 'temperature' || stateName === 'kelvin') {
      return {
        valueType: 'number',
        unit: 'K',
      };
    }
    if (stateName === 'active' || stateName === 'on' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'string' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'hsv',
        description: 'Set RGB color. Use "0,100,100" for red, "120,100,100" for green, "240,100,100" for blue',
        commandType: 'hsv',
        valueType: 'string'
      },
      {
        name: 'temp',
        description: 'Set warm/cool white. Use "100,2700" for warm, "100,6500" for cool',
        commandType: 'temp',
        valueType: 'string'
      },
      {
        name: 'setBrightness',
        description: 'Set brightness level from 0 to 100',
        commandType: 'setBrightness',
        valueType: 'number',
        min: this.control.details?.min || 0,
        max: this.control.details?.max || 100,
        step: this.control.details?.step || 0.5,
      },
      {
        name: 'daylight',
        description: 'Set daylight mode with brightness (0-100)',
        commandType: 'daylight',
        valueType: 'number',
        min: this.control.details?.min || 0,
        max: this.control.details?.max || 100,
        step: this.control.details?.step || 0.5,
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'setBrightness' && !!value) {
      return `jdev/sps/io/${this.uuid}/setBrightness/${value}`;
    } else if (command === 'hsv' && !!value) {
      const hsvString = value.toString().replace(/[()]/g, '');
      return `jdev/sps/io/${this.uuid}/hsv(${hsvString})`;
    } else if (command === 'temp' && !!value) {
      const tempString = value.toString().replace(/[()]/g, '');
      return `jdev/sps/io/${this.uuid}/temp(${tempString})`;
    } else if (command === 'daylight' && !!value) {
      return `jdev/sps/io/${this.uuid}/daylight(${value})`;
    }
    throw new Error(`Invalid command ${command} for ColorPickerV2`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const active = statesToUse.find(s => s.name === 'active');
    const value = statesToUse.find(s => s.name === 'value');
    const color = statesToUse.find(s => s.name === 'color');
    let status = active?.value ? 'ON' : 'OFF';
    if (value?.value) status += ` ${value.value}%`;
    if (color?.value) status += ` HSV:${color.value}`;
    return `RGB Light (${status})`;
  }
}