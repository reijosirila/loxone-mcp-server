import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { toBoolean, toNumber } from '../utils/index.js';

const POWER_STATES = new Set(['prodCurr', 'consCurr', 'gridCurr', 'batteryCurr']);
const ENERGY_STATES = new Set(['prodCurrDay', 'prodCurrMonth', 'prodCurrYear', 'prodTotal', 'consCurrDay', 'consTotal', 'deliveryDay']);
const MONEY_STATES = new Set(['earningsDay', 'earningsMonth', 'earningsYear', 'earningsTotal']);

/** Legacy Fronius / energy monitor block: production, consumption, grid and battery figures. */
export class FroniusControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Fronius, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    if (POWER_STATES.has(stateName)) return { valueType: 'number', unit: 'kW' };
    if (ENERGY_STATES.has(stateName)) return { valueType: 'number', unit: 'kWh' };
    if (MONEY_STATES.has(stateName)) return { valueType: 'number', unit: this.structure.msInfo?.currency };
    if (stateName === 'stateOfCharge') return { valueType: 'number', unit: '%' };
    if (stateName === 'online') return { valueType: 'boolean', value: toBoolean(value) };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  generateSummary(): string {
    const states = this.states;
    const get = (name: string) => toNumber(states.find(s => s.name === name)?.value);
    const online = toBoolean(states.find(s => s.name === 'online')?.value);
    if (online === false) return 'Energy monitor offline';
    const parts: string[] = [];
    const prod = get('prodCurr');
    const cons = get('consCurr');
    const grid = get('gridCurr');
    const battery = get('batteryCurr');
    const soc = get('stateOfCharge');
    const prodDay = get('prodCurrDay');
    if (prod !== undefined) parts.push(`producing ${prod.toFixed(2)} kW`);
    if (cons !== undefined) parts.push(`consuming ${cons.toFixed(2)} kW`);
    if (grid !== undefined) parts.push(grid < 0 ? `exporting ${Math.abs(grid).toFixed(2)} kW` : `importing ${grid.toFixed(2)} kW`);
    if (battery !== undefined && battery !== 0) parts.push(battery < 0 ? `battery charging ${Math.abs(battery).toFixed(2)} kW` : `battery discharging ${battery.toFixed(2)} kW`);
    if (soc !== undefined) parts.push(`battery ${Math.round(soc)}%`);
    if (prodDay !== undefined) parts.push(`today ${prodDay.toFixed(1)} kWh produced`);
    return `Energy monitor (${parts.length ? parts.join(', ') : 'no data'})`;
  }
}
