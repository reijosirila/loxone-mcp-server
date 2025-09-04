/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class AlarmControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Alarm, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'armed' || stateName === 'triggered' || stateName === 'active' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    if (stateName === 'level' || stateName === 'zone') {
      return { valueType: 'number' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'boolean' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'arm',
        description: 'Arm the alarm',
        commandType: 'pulse'
      },
      {
        name: 'disarm',
        description: 'Disarm the alarm',
        commandType: 'pulse'
      },
      {
        name: 'acknowledge',
        description: 'Acknowledge alarm',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'arm' || command === 'disarm' || command === 'acknowledge') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for Alarm`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const armed = statesToUse.find(s => s.name === 'armed');
    const triggered = statesToUse.find(s => s.name === 'triggered');
    const level = statesToUse.find(s => s.name === 'level');
    let status = 'DISARMED';
    if (triggered?.value) {
      status = 'TRIGGERED';
    } else if (armed?.value) {
      status = 'ARMED';
    }
    if (level?.value !== undefined && level.value !== null && typeof level.value === 'number' && level.value > 0) {
      status += ` (Level ${level.value})`;
    }
    return `Alarm (${status})`;
  }
}