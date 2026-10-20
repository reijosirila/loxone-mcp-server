import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatDuration, formatLoxoneTimestamp, toBoolean, toNumber } from '../utils/index.js';

export class AlarmClockControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.AlarmClock, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    switch (stateName) {
      case 'isEnabled':
      case 'isAlarmActive':
      case 'confirmationNeeded':
        return { valueType: 'boolean', value: toBoolean(value) };
      case 'ringingTime':
      case 'ringDuration':
      case 'prepareDuration':
      case 'snoozeTime':
      case 'snoozeDuration':
        return { valueType: 'number', unit: 's' };
      case 'nextEntryTime':
        return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  availableControlCommands(): ControlCommand[] {
    return [
      { name: 'snooze', description: 'Snooze the ringing alarm', commandType: 'pulse' },
      { name: 'dismiss', description: 'Dismiss (stop) the ringing alarm', commandType: 'pulse' },
    ];
  }

  buildControlCommand(command: string): string {
    if (command === 'snooze' || command === 'dismiss') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for AlarmClock`);
  }

  generateSummary(): string {
    const states = this.states;
    const enabled = toBoolean(states.find(s => s.name === 'isEnabled')?.value);
    const ringing = toBoolean(states.find(s => s.name === 'isAlarmActive')?.value);
    const snooze = toNumber(states.find(s => s.name === 'snoozeTime')?.value);
    const next = states.find(s => s.name === 'nextEntryTime')?.value;
    if (ringing) return 'Alarm clock RINGING';
    if (snooze && snooze > 0) return `Alarm clock snoozed (${formatDuration(snooze)} left)`;
    if (enabled === false) return 'Alarm clock disabled';
    return `Alarm clock enabled${next ? `, next alarm ${next}` : ''}`;
  }
}
