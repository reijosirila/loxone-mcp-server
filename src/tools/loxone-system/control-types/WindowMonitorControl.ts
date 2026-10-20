import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { toNumber } from '../utils/index.js';

// Bit flags of each entry in the comma-separated `windowStates` text state
const WINDOW_CLOSED = 1;
const WINDOW_TILTED = 2;
const WINDOW_OPEN = 4;
const WINDOW_LOCKED = 8;
const WINDOW_UNLOCKED = 16;

interface WindowStatus {
  name: string;
  state: 'closed' | 'tilted' | 'open' | 'unknown';
  locked?: boolean;
}

export class WindowMonitorControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.WindowMonitor, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; value?: unknown } {
    if (stateName.startsWith('num')) return { valueType: 'number' };
    if (stateName === 'windowStates') return { valueType: 'object', value: this.windows() };
    return { valueType: typeof value === 'number' ? 'number' : 'string' };
  }

  private windows(): WindowStatus[] {
    const raw = this.stateCache.get(String(this.control.states?.windowStates ?? ''))?.value;
    const configured = this.control.details?.windows;
    if (typeof raw !== 'string' || !configured) return [];
    const names = Object.values(configured as Record<string, { name?: string }>).map((w, i) => w?.name ?? `Window ${i + 1}`);
    return raw.split(',').map((flags, i) => {
      const bits = toNumber(flags) ?? 0;
      const state: WindowStatus['state'] = bits & WINDOW_OPEN ? 'open' : bits & WINDOW_TILTED ? 'tilted' : bits & WINDOW_CLOSED ? 'closed' : 'unknown';
      const status: WindowStatus = { name: names[i] ?? `Window ${i + 1}`, state };
      if (bits & WINDOW_LOCKED) status.locked = true;
      else if (bits & WINDOW_UNLOCKED) status.locked = false;
      return status;
    });
  }

  generateSummary(): string {
    const states = this.states;
    const count = (name: string) => toNumber(states.find(s => s.name === name)?.value) ?? 0;
    const open = count('numOpen');
    const tilted = count('numTilted');
    const closed = count('numClosed');
    const offline = count('numOffline');
    const parts = [`${open} open`, `${tilted} tilted`, `${closed} closed`];
    if (offline > 0) parts.push(`${offline} offline`);
    const notClosed = this.windows().filter(w => w.state === 'open' || w.state === 'tilted');
    const detail = notClosed.length > 0 ? ` (${notClosed.map(w => `${w.name}: ${w.state}`).join(', ')})` : '';
    return `Windows/doors: ${parts.join(', ')}${detail}`;
  }
}
