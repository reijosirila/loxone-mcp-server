import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { formatDuration, toNumber } from '../utils/index.js';

export class TimedSwitchControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.TimedSwitch, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): { valueType: 'number' | 'boolean' | 'string' | 'object'; unit?: string } {
    if (stateName === 'deactivationDelay' || stateName === 'deactivationDelayTotal') {
      return { valueType: 'number', unit: 's' };
    }
    return { valueType: typeof value === 'boolean' ? 'boolean' : 'number' };
  }

  availableControlCommands(): ControlCommand[] {
    return [
      { name: 'pulse', description: 'Start the timer: turns on for the configured duration (deactivationDelayTotal), then off', commandType: 'pulse' },
      { name: 'on', description: 'Turn on permanently (no automatic switch-off)', commandType: 'pulse' },
      { name: 'off', description: 'Turn off', commandType: 'pulse' },
    ];
  }

  buildControlCommand(command: string): string {
    if (['pulse', 'on', 'off'].includes(command)) {
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for TimedSwitch`);
  }

  generateSummary(): string {
    const states = this.states;
    const delay = toNumber(states.find(s => s.name === 'deactivationDelay')?.value);
    const total = toNumber(states.find(s => s.name === 'deactivationDelayTotal')?.value);
    if (delay === undefined) return 'Timed switch (unknown state)';
    if (delay === -1) return 'Timed switch ON (permanent)';
    if (delay > 0) return `Timed switch ON (${formatDuration(delay)} remaining${total ? ` of ${formatDuration(total)}` : ''})`;
    return `Timed switch OFF${total ? ` (timer duration ${formatDuration(total)})` : ''}`;
  }
}
