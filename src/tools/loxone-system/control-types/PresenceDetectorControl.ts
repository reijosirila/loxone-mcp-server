import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatLoxoneTimestamp, toBoolean, toNumber } from '../utils/index.js';

export class PresenceDetectorControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.PresenceDetector, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    switch (stateName) {
      case 'active':
      case 'locked':
        return { valueType: 'boolean', value: toBoolean(value) };
      case 'events':
        return { valueType: 'number' };
      case 'activeSince':
      case 'lockedUntil':
      case 'activeUntil':
        return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
      case 'infoText':
        return { valueType: 'string' };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  generateSummary(): string {
    const states = this.states;
    const active = toBoolean(states.find(s => s.name === 'active')?.value);
    const locked = toBoolean(states.find(s => s.name === 'locked')?.value);
    const events = toNumber(states.find(s => s.name === 'events')?.value);
    const info = states.find(s => s.name === 'infoText')?.value;
    const parts = [active === undefined ? 'Presence unknown' : active ? 'Presence detected' : 'No presence'];
    if (events !== undefined) parts.push(`${events} events`);
    if (locked) parts.push(`locked${info ? `: ${info}` : ''}`);
    return parts.join(', ');
  }
}
