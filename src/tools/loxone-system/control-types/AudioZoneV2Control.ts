import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class AudioZoneV2Control extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.AudioZoneV2, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'volume') {
      return {
        valueType: 'number',
        unit: '%',
      };
    }
    if (stateName === 'playState') {
      // playState: -1 = unknown, 0 = stopped, 1 = paused, 2 = playing
      return { 
        valueType: 'number', 
      };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      { name: 'play', description: 'Play (turns on if needed)', commandType: 'pulse' },
      { name: 'pause', description: 'Pause', commandType: 'pulse' },
      { name: 'next', description: 'Next track', commandType: 'pulse' },
      { name: 'prev', description: 'Previous track', commandType: 'pulse' },
      { name: 'volUp', description: 'Volume up', commandType: 'pulse' },
      { name: 'volDown', description: 'Volume down', commandType: 'pulse' },
      {
        name: 'volume',
        description: 'Set volume',
        commandType: 'setValue',
        valueType: 'number',
        min: this.control.details?.min || 0,
        max: this.control.details?.max || 100,
        step: this.control.details?.step || 0.5,
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (['play', 'pause', 'next', 'prev', 'volUp', 'volDown'].includes(command)) {
      return `jdev/sps/io/${this.uuid}/${command}`;
    } else if (command === 'volume' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/volume/${value}`;
    }
    throw new Error(`Invalid command ${command} for AudioZone`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const playState = statesToUse.find(s => s.name === 'playState');
    const volume = statesToUse.find(s => s.name === 'volume');
    let status = '';
    // playState: -1 = unknown, 0 = stopped, 1 = paused, 2 = playing
    if (playState?.value === 2) {
      status = 'PLAYING';
    } else if (playState?.value === 1) {
      status = 'PAUSED';
    } else if (playState?.value === 0) {
      status = 'STOPPED';
    } else {
      status = 'UNKNOWN';
    }
    if (volume?.value !== undefined) {
      status += ` Vol:${volume.value}%`;
    }
    return `Audio Zone V2 (${status})`;
  }
  
  // Override to filter out redundant or non-essential states
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    // Only keep playState and volume for AudioZoneV2
    const audioKeep = ['playState', 'volume'];
    if (!audioKeep.includes(state.name)) {
      return true;
    }
    
    return false;
  }
}