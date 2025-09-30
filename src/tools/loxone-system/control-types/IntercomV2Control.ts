/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class IntercomV2Control extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.IntercomV2, structure, stateCache);
  }

  public availableControlCommands(): ControlCommand[] {
    return [];
  }

  buildControlCommand(command: string, value?: unknown): string {
    throw new Error(`Invalid command ${command} for Intercom`);
  }

  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    switch (stateName) {
      case 'bell':
      case 'muted':
        return { valueType: 'boolean' };
      default:
        const valueType = typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'object'
          ? typeof value as 'number' | 'boolean' | 'string' | 'object'
          : 'string';
        return { valueType };
    }
  }

  generateSummary(): string {
    const states = this.states;
    const ringing = states.find(s => s.name === 'bell');
    const muted = states.find(s => s.name === 'muted');
    const statusParts = [];

    if (ringing?.value) {
      statusParts.push('BELL RINGING');
    }

    if (muted?.value) {
      statusParts.push('MUTED');
    }
    const status = statusParts.length > 0 ? statusParts.join(', ') : 'IDLE';
    return `Intercom (${status})`;
  }
}