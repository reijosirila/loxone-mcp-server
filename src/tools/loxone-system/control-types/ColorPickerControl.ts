 
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class ColorPickerControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.ColorPicker, structure, stateCache);
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
      /*
      {
        name: 'on',
        description: 'Enable the ColorPicker',
        commandType: 'pulse'
      },
      {
        name: 'off',
        description: 'Disable the ColorPicker',
        commandType: 'pulse'
      },
      */
      {
        name: 'hsv',
        description: 'Set HSV color. Format: "hue,saturation,value" (H=0-360, S=0-100, V=0-100)',
        commandType: 'hsv',
        valueType: 'string'
      },
      /*
      {
        name: 'lumitech',
        description: 'Set color temperature (Lumitech only). Format: "brightness,kelvin" (brightness=0-100, kelvin=2700-6500)',
        commandType: 'lumitech',
        valueType: 'string'
      }
      */
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'on' || command === 'off') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    } else if (command === 'hsv' && !!value) {
      const hsvString = value.toString().replace(/[()]/g, '');
      return `jdev/sps/io/${this.uuid}/hsv(${hsvString})`;
    } else if (command === 'lumitech' && !!value) {
      const lumitechString = value.toString().replace(/[()]/g, '');
      return `jdev/sps/io/${this.uuid}/lumitech(${lumitechString})`;
    }
    throw new Error(`Invalid command ${command} for ColorPicker`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const active = statesToUse.find(s => s.name === 'active');
    const value = statesToUse.find(s => s.name === 'value');
    const color = statesToUse.find(s => s.name === 'color');
    let status = active?.value ? 'ON' : 'OFF';
    if (value?.value) status += ` ${value.value}%`;
    if (color?.value) status += ` HSV:${color.value}`;
    return `Color Light (${status})`;
  }
}