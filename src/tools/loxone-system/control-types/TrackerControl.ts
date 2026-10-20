import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

/** Tracker block: a rolling log of text entries (newest first), separated by '|'. */
export class TrackerControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Tracker, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; value?: unknown } {
    if (stateName === 'entries') return { valueType: 'object', value: this.entries(value) };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  private entries(value: unknown): string[] {
    if (typeof value !== 'string' || value === '') return [];
    return value.split('|').map(e => e.trim()).filter(e => e.length > 0);
  }

  generateSummary(): string {
    const uuid = this.control.states?.entries;
    const entries = this.entries(typeof uuid === 'string' ? this.stateCache.get(uuid)?.value : undefined);
    if (entries.length === 0) return 'Tracker (no entries)';
    return `Tracker (${entries.length} entries, latest: ${entries[0]})`;
  }
}
