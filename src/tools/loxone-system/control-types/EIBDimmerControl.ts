import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class EIBDimmerControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.EIBDimmer, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'value' || stateName === 'position') {
      return {
        valueType: 'number',
        unit: '%',
      };
    }
    if (stateName === 'active' || stateName === 'on' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
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
      },
      {
        name: 'setValue',
        description: 'Set brightness level (0-100)',
        commandType: 'setValue',
        valueType: 'number',
        min: 0,
        max: 100,
        step: 1
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'on') {
      return `jdev/sps/io/${this.uuid}/on`;
    } else if (command === 'off') {
      return `jdev/sps/io/${this.uuid}/off`;
    } else if (command === 'setValue' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/${value}`;
    }
    throw new Error(`Invalid command ${command} for EIBDimmer`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const value = statesToUse.find(s => s.name === 'value' || s.name === 'position');
    // If there's a value > 0, it's ON
    if (value?.value && typeof value.value === 'number' && value.value > 0) {
      return `EIB Dimmer (ON ${value.value}%)`;
    } else {
      return `EIB Dimmer (OFF)`;
    }
  }
}