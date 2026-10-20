import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { toBoolean, toNumber } from '../utils/index.js';

/** Ventilation controller (read-only until the command set is verified against a real unit). */
export class VentilationControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Ventilation, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    switch (stateName) {
      case 'speed':
        return { valueType: 'number', unit: '%' };
      case 'temperatureIndoor':
      case 'temperatureOutdoor':
      case 'temperatureTarget':
      case 'temperatureSupport':
      case 'frostTemp':
        return { valueType: 'number', unit: '°C' };
      case 'humidityIndoor':
      case 'humidityMax':
        return { valueType: 'number', unit: '%' };
      case 'airQualityIndoor':
      case 'airQualityMax':
        return { valueType: 'number', unit: 'ppm' };
      case 'mode':
      case 'activeMode':
        return { valueType: 'string', value: this.modeName(value) };
      case 'presence':
      case 'heatExchanger':
        return { valueType: 'boolean', value: toBoolean(value) };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  private modeName(value: unknown): string | null {
    const id = toNumber(value);
    if (id === undefined) return null;
    const modes = this.control.details?.modes;
    const list = Array.isArray(modes) ? modes : modes && typeof modes === 'object' ? Object.values(modes) : [];
    const match = (list as Array<{ id?: number; name?: string }>).find(m => m?.id === id);
    return match?.name ?? `mode ${id}`;
  }

  generateSummary(): string {
    const states = this.states;
    const get = (name: string) => states.find(s => s.name === name)?.value;
    const speed = toNumber(get('speed'));
    const mode = get('activeMode') ?? get('mode');
    const tIn = toNumber(get('temperatureIndoor'));
    const hum = toNumber(get('humidityIndoor'));
    const co2 = toNumber(get('airQualityIndoor'));
    const parts: string[] = [];
    if (speed !== undefined) parts.push(speed > 0 ? `fan ${speed}%` : 'fan off');
    if (mode) parts.push(`mode ${mode}`);
    if (tIn !== undefined) parts.push(`indoor ${tIn.toFixed(1)}°C`);
    if (hum !== undefined) parts.push(`${Math.round(hum)}% RH`);
    if (co2 !== undefined) parts.push(`${Math.round(co2)} ppm`);
    return `Ventilation (${parts.length ? parts.join(', ') : 'no data'})`;
  }
}
