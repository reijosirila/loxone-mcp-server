/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class CentralAlarmControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.CentralAlarm, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'armed' || stateName === 'triggered' || stateName === 'active' || 
        stateName === 'armedStay' || stateName === 'armedAway' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    if (stateName === 'mode' || stateName === 'zone' || stateName === 'level') {
      return { valueType: 'number' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'boolean' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'on',
        description: 'Arm the alarm',
        commandType: 'pulse'
      },
      {
        name: 'off',
        description: 'Disarm the alarm',
        commandType: 'pulse'
      },
      {
        name: 'quit',
        description: 'Quit/acknowledge alarm',
        commandType: 'pulse'
      },
      {
        name: 'delayedOn',
        description: 'Arm with delay',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'on' || command === 'off' || command === 'quit' || command === 'delayedOn') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for CentralAlarm`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const armed = statesToUse.find(s => s.name === 'armed');
    const armedStay = statesToUse.find(s => s.name === 'armedStay');
    const armedAway = statesToUse.find(s => s.name === 'armedAway');
    const triggered = statesToUse.find(s => s.name === 'triggered');
    
    let status = 'DISARMED';
    if (triggered?.value) {
      status = 'TRIGGERED';
    } else if (armedAway?.value) {
      status = 'ARMED (Away)';
    } else if (armedStay?.value) {
      status = 'ARMED (Stay)';
    } else if (armed?.value) {
      status = 'ARMED';
    }
    
    return `Central Alarm (${status})`;
  }
}