import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { extractUnit, formatLoxoneValue, toNumber } from '../utils/index.js';

const ANALOG_TYPES = new Set<string>([ControlType.ValueSelector, ControlType.UpDownAnalog, ControlType.LeftRightAnalog, ControlType.UpDownLeftRightAnalog]);

/** ValueSelector and the analog UpDown/LeftRight button blocks: a numeric value with min/max/step. */
export class ValueSelectorControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    const type = ANALOG_TYPES.has(control.type) ? control.type as ControlType : ControlType.ValueSelector;
    super(uuid, control, type, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string } {
    if (stateName === 'value' || stateName === 'min' || stateName === 'max' || stateName === 'step') {
      return { valueType: 'number', unit: stateName === 'value' ? extractUnit(this.control.details?.format) : undefined };
    }
    if (stateName === 'error') return { valueType: 'boolean' };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  private get range(): { min?: number; max?: number; step?: number } {
    const fromState = (name: string) => {
      const uuid = this.control.states?.[name];
      return typeof uuid === 'string' ? toNumber(this.stateCache.get(uuid)?.value) : undefined;
    };
    return {
      min: fromState('min') ?? toNumber(this.control.details?.min),
      max: fromState('max') ?? toNumber(this.control.details?.max),
      step: fromState('step') ?? toNumber(this.control.details?.step),
    };
  }

  availableControlCommands(): ControlCommand[] {
    const { min, max, step } = this.range;
    const increaseOnly = this.control.details?.increaseOnly === true;
    return [{
      name: 'setValue',
      description: `Set the value${increaseOnly ? ' (this control only accepts increases)' : ''}`,
      commandType: 'setValue',
      valueType: 'number',
      min,
      max,
      step,
    }];
  }

  buildControlCommand(command: string, value?: unknown): string {
    if (command !== 'setValue') {
      throw new Error(`Invalid command ${command} for ${this.type}`);
    }
    const numeric = toNumber(value);
    if (numeric === undefined) {
      throw new Error(`setValue requires a numeric value, got '${value}'`);
    }
    const { min, max } = this.range;
    if ((min !== undefined && numeric < min) || (max !== undefined && numeric > max)) {
      throw new Error(`Value ${numeric} is outside the allowed range ${min ?? '-∞'}..${max ?? '∞'}`);
    }
    return `jdev/sps/io/${this.uuid}/${numeric}`;
  }

  generateSummary(): string {
    const value = this.states.find(s => s.name === 'value')?.value;
    if (value === undefined || value === null) return `${this.type} (no value)`;
    const { min, max } = this.range;
    const rangeText = min !== undefined && max !== undefined ? `, range ${min}..${max}` : '';
    return `${this.type} ${formatLoxoneValue(this.control.details?.format, value)}${rangeText}`;
  }
}
