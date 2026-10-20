import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { toBoolean, toNumber } from '../utils/index.js';

export class LoadManagerControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.LoadManager, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    if (['currentPower', 'peakOverloadPower', 'maxPower', 'availablePower'].includes(stateName)) {
      return { valueType: 'number', unit: 'kW' };
    }
    if (stateName === 'maxPowerExceeded') return { valueType: 'boolean', value: toBoolean(value) };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  generateSummary(): string {
    const states = this.states;
    const current = toNumber(states.find(s => s.name === 'currentPower')?.value);
    const max = toNumber(states.find(s => s.name === 'maxPower')?.value);
    const exceeded = toBoolean(states.find(s => s.name === 'maxPowerExceeded')?.value);
    const parts: string[] = [];
    if (current !== undefined) parts.push(`${current.toFixed(2)} kW${max !== undefined ? ` of ${max.toFixed(2)} kW` : ''}`);
    if (exceeded) parts.push('LIMIT EXCEEDED');
    return `Load manager (${parts.length ? parts.join(', ') : 'no data'})`;
  }
}
