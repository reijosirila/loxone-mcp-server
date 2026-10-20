import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatLoxoneTimestamp, toBoolean } from '../utils/index.js';

/** First-generation Intercom block (door station). */
export class IntercomControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Intercom, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; value?: unknown } {
    if (stateName === 'bell') return { valueType: 'boolean', value: toBoolean(value) };
    if (stateName === 'lastBellTimestamp') return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  availableControlCommands(): ControlCommand[] {
    return [{ name: 'answer', description: 'Answer the door bell (stops ringing)', commandType: 'pulse' }];
  }

  buildControlCommand(command: string): string {
    if (command === 'answer') return `jdev/sps/io/${this.uuid}/answer`;
    throw new Error(`Invalid command ${command} for Intercom`);
  }

  generateSummary(): string {
    const states = this.states;
    const bell = toBoolean(states.find(s => s.name === 'bell')?.value);
    const last = states.find(s => s.name === 'lastBellTimestamp')?.value;
    return bell ? 'Intercom: bell RINGING' : `Intercom idle${last ? ` (last bell ${last})` : ''}`;
  }
}
