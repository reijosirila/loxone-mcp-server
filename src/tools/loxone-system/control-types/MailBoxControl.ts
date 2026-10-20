import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatLoxoneTimestamp, toBoolean } from '../utils/index.js';

export class MailBoxControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.MailBox, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; value?: unknown } {
    if (stateName === 'packetReceived' || stateName === 'mailReceived' || stateName === 'notificationsDisabledInput') {
      return { valueType: 'boolean', value: toBoolean(value) };
    }
    if (stateName === 'disableEndTime') return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  availableControlCommands(): ControlCommand[] {
    return [
      { name: 'confirmPacket', description: 'Confirm that the parcel has been taken out', commandType: 'pulse' },
      { name: 'confirmMail', description: 'Confirm that the mail has been taken out', commandType: 'pulse' },
    ];
  }

  buildControlCommand(command: string): string {
    if (command === 'confirmPacket' || command === 'confirmMail') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for MailBox`);
  }

  generateSummary(): string {
    const states = this.states;
    const packet = toBoolean(states.find(s => s.name === 'packetReceived')?.value);
    const mail = toBoolean(states.find(s => s.name === 'mailReceived')?.value);
    const parts: string[] = [];
    if (packet) parts.push('parcel waiting');
    if (mail) parts.push('mail waiting');
    return `Mailbox (${parts.length ? parts.join(', ') : 'empty'})`;
  }
}
