import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatLoxoneTimestamp, toBoolean, toNumber } from '../utils/index.js';

const SMART_ALARM_LEVELS: Record<number, string> = { 0: 'none', 1: 'immediate alarm', 2: 'delayed alarm' };
const EMERGENCY_STATUS: Record<number, string> = { 0: 'running', 1: 'ALARM', 2: 'shut down by reset input', 3: 'temporarily disabled' };

/**
 * Ambient Assisted Living blocks (smart alarm and emergency button). Deliberately read-only:
 * confirming or disabling a care alarm must stay a human decision.
 */
export class AalControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, control.type === ControlType.AalEmergency ? ControlType.AalEmergency : ControlType.AalSmartAlarm, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; value?: unknown } {
    switch (stateName) {
      case 'alarmLevel': {
        const n = toNumber(value);
        return { valueType: 'string', value: n === undefined ? null : (SMART_ALARM_LEVELS[n] ?? `level ${n}`) };
      }
      case 'status': {
        const n = toNumber(value);
        return { valueType: 'string', value: n === undefined ? null : (EMERGENCY_STATUS[n] ?? `status ${n}`) };
      }
      case 'isLocked':
      case 'isLeaveActive':
        return { valueType: 'boolean', value: toBoolean(value) };
      case 'disableEndTime':
        return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  generateSummary(): string {
    const states = this.states;
    if (this.type === ControlType.AalEmergency) {
      const status = states.find(s => s.name === 'status')?.value;
      return `Emergency button: ${status ?? 'unknown'}`;
    }
    const level = states.find(s => s.name === 'alarmLevel')?.value;
    const cause = states.find(s => s.name === 'alarmCause')?.value;
    return `Smart alarm: ${level ?? 'unknown'}${cause ? ` (${cause})` : ''}`;
  }
}
