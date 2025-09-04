/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class GateControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Gate, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'position') {
      return {
        valueType: 'number',
      };
    }
    if (stateName === 'active') {
      // active: -1 = closing, 0 = not moving, 1 = opening
      return {
        valueType: 'number',
      };
    }
    if (stateName === 'preventOpen' || stateName === 'preventClose' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'open',
        description: 'Open the gate',
        commandType: 'pulse'
      },
      {
        name: 'close',
        description: 'Close the gate',
        commandType: 'pulse'
      },
      {
        name: 'stop',
        description: 'Stop gate movement',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'open' || command === 'close' || command === 'stop') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for Gate`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const position = statesToUse.find(s => s.name === 'position');
    const active = statesToUse.find(s => s.name === 'active');
    const preventOpen = statesToUse.find(s => s.name === 'preventOpen');
    const preventClose = statesToUse.find(s => s.name === 'preventClose');
    
    let status = '';
    
    // Check movement state first
    if (active?.value === 1) {
      status = 'OPENING';
    } else if (active?.value === -1) {
      status = 'CLOSING';
    } else if (position?.value !== undefined && position.value !== null && typeof position.value === 'number') {
      // Position: 1 = fully open, 0 = fully closed
      const positionPercent = Math.round(position.value * 100);
      if (positionPercent === 100) {
        status = 'OPEN';
      } else if (positionPercent === 0) {
        status = 'CLOSED';
      } else {
        status = `${positionPercent}% open`;
      }
    } else {
      status = 'UNKNOWN';
    }
    
    // Add prevention warnings
    const preventions = [];
    if (preventOpen?.value === 1) preventions.push('open blocked');
    if (preventClose?.value === 1) preventions.push('close blocked');
    if (preventions.length > 0) {
      status += ` (${preventions.join(', ')})`;
    }
    
    return `Gate (${status})`;
  }
}