import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { extractUnit, formatDuration, formatLoxoneValue, toBoolean, toNumber } from '../utils/index.js';

/** Daytimer schedule block. The schedule itself is edited in Loxone Config; here we expose its current output. */
export class DaytimerControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Daytimer, structure, stateCache);
  }

  private get isAnalog(): boolean {
    return this.control.details?.analog === true;
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    switch (stateName) {
      case 'value':
        return this.isAnalog
          ? { valueType: 'number', unit: extractUnit(this.control.details?.format) }
          : { valueType: 'boolean', value: toBoolean(value) };
      case 'override':
        return { valueType: 'number', unit: 's' };
      case 'needsActivation':
      case 'resetActive':
        return { valueType: 'boolean', value: toBoolean(value) };
      case 'mode':
        return { valueType: 'number' };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  generateSummary(): string {
    const states = this.states;
    const value = states.find(s => s.name === 'value')?.value;
    const override = toNumber(states.find(s => s.name === 'override')?.value);
    const current = this.isAnalog
      ? formatLoxoneValue(this.control.details?.format, value)
      : (toBoolean(value) ? 'ON' : 'OFF');
    const overrideText = override && override > 0 ? `, override active for ${formatDuration(override)}` : '';
    return `Schedule output ${current}${overrideText}`;
  }
}
