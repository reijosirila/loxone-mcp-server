import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatDuration, formatLoxoneTimestamp, toBoolean, toNumber } from '../utils/index.js';

const LEVEL_NAMES: Record<number, string> = { 0: 'none', 1: 'silent', 2: 'acoustic', 3: 'optical', 4: 'internal', 5: 'external', 6: 'remote' };
const CAUSE_NAMES: Record<number, string> = {
  0: 'none', 1: 'smoke', 2: 'water', 3: 'smoke and water', 4: 'temperature',
  5: 'fire and temperature', 6: 'temperature and water', 7: 'fire, temperature and water'
};

export class SmokeAlarmControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.SmokeAlarm, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    switch (stateName) {
      case 'level':
      case 'nextLevel': {
        const n = toNumber(value);
        return { valueType: 'string', value: n === undefined ? null : (LEVEL_NAMES[n] ?? `level ${n}`) };
      }
      case 'alarmCause': {
        const n = toNumber(value);
        return { valueType: 'string', value: n === undefined ? null : (CAUSE_NAMES[n] ?? `cause ${n}`) };
      }
      case 'nextLevelDelay':
      case 'nextLevelDelayTotal':
      case 'timeServiceMode':
        return { valueType: 'number', unit: 's' };
      case 'acousticAlarm':
      case 'testAlarm':
      case 'areAlarmSignalsOff':
        return { valueType: 'boolean', value: toBoolean(value) };
      case 'startTime':
        return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  availableControlCommands(): ControlCommand[] {
    return [
      { name: 'mute', description: 'Mute the acoustic alarm signal', commandType: 'pulse' },
      { name: 'quit', description: 'Acknowledge (quit) the current alarm', commandType: 'pulse' },
    ];
  }

  buildControlCommand(command: string): string {
    if (command === 'mute' || command === 'quit') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for SmokeAlarm`);
  }

  generateSummary(): string {
    const states = this.states;
    const level = toNumber(this.rawValue('level'));
    const testAlarm = toBoolean(this.rawValue('testAlarm'));
    if (testAlarm) return 'Smoke alarm: TEST ALARM running';
    if (level === undefined) return 'Smoke alarm (unknown state)';
    if (level === 0) {
      const nextDelay = toNumber(this.rawValue('nextLevelDelay'));
      return nextDelay && nextDelay > 0 ? `Smoke alarm: pre-alarm, escalates in ${formatDuration(nextDelay)}` : 'Smoke alarm: no alarm';
    }
    const cause = states.find(s => s.name === 'alarmCause')?.value;
    const acoustic = toBoolean(this.rawValue('acousticAlarm'));
    return `Smoke alarm: ALARM ACTIVE (${LEVEL_NAMES[level] ?? level}${cause ? `, cause: ${cause}` : ''}${acoustic ? ', siren on' : ''})`;
  }

  private rawValue(stateName: string): unknown {
    const uuid = this.control.states?.[stateName];
    return typeof uuid === 'string' ? this.stateCache.get(uuid)?.value : undefined;
  }
}
