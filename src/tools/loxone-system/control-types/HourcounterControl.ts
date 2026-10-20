import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatDuration, formatLoxoneTimestamp, toBoolean, toNumber } from '../utils/index.js';

export class HourcounterControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Hourcounter, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string; value?: unknown } {
    switch (stateName) {
      case 'total':
      case 'remaining':
      case 'maintenanceInterval':
      case 'overdueSince':
      case 'totalTime':
        return { valueType: 'number', unit: 's' };
      case 'lastActivation':
        return { valueType: 'string', value: formatLoxoneTimestamp(value) ?? null };
      case 'active':
      case 'overdue':
        return { valueType: 'boolean', value: toBoolean(value) };
      default:
        return { valueType: typeof value === 'number' ? 'number' : 'string' };
    }
  }

  generateSummary(): string {
    const states = this.states;
    const active = toBoolean(states.find(s => s.name === 'active')?.value);
    const total = toNumber(states.find(s => s.name === 'total')?.value);
    const remaining = toNumber(states.find(s => s.name === 'remaining')?.value);
    const overdue = toBoolean(states.find(s => s.name === 'overdue')?.value);
    const parts = [active ? 'running' : 'idle'];
    if (total !== undefined) parts.push(`total ${formatDuration(total)}`);
    if (overdue) parts.push('MAINTENANCE OVERDUE');
    else if (remaining !== undefined && remaining > 0) parts.push(`maintenance due in ${formatDuration(remaining)}`);
    return `Hour counter (${parts.join(', ')})`;
  }
}
