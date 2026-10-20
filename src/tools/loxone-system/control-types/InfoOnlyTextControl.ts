import { ReadOnlyControl } from './ReadOnlyControl.js';
import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class InfoOnlyTextControl extends ReadOnlyControl {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.InfoOnlyText, structure, stateCache);
  }

  formatState(): { valueType: 'number' | 'boolean' | 'string' | 'object' } {
    return { valueType: 'string' };
  }

  generateSummary(): string {
    const text = this.states.find(s => s.name === 'text')?.value;
    return text === undefined || text === null || text === '' ? 'Info (no text)' : `Info (${text})`;
  }
}
