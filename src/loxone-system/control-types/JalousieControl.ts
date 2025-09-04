 
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class JalousieControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Jalousie, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'position' || stateName === 'value') {
      return {
        valueType: 'number',
        unit: '%',
      };
    }
    if (stateName === 'active' || stateName === 'moving' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'up',
        description: 'Move up',
        commandType: 'pulse'
      },
      {
        name: 'down',
        description: 'Move down',
        commandType: 'pulse'
      },
      {
        name: 'stop',
        description: 'Stop movement',
        commandType: 'pulse'
      },
      {
        name: 'setPosition',
        description: 'Set position',
        commandType: 'setValue',
        valueType: 'number',
        min: this.control.details?.min || 0,
        max: this.control.details?.max || 100,
        step: this.control.details?.step || 0.5,
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (['up', 'down', 'stop'].includes(command)) {
      return `jdev/sps/io/${this.uuid}/${command}`;
    } else if (command === 'setPosition' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/${value}`;
    }
    throw new Error(`Invalid command ${command} for Jalousie`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const pos = statesToUse.find(s => s.name === 'position');
    return `Blinds at ${pos?.value ?? 0}%`;
  }
}