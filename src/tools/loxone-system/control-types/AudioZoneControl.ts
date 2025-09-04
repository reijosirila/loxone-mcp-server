 
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class AudioZoneControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.AudioZone, structure, stateCache);
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
    if (stateName === 'activeOutput' || stateName === 'favoriteId') {
      return { valueType: 'number' };
    }
    if (stateName === 'power' || stateName === 'muted' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    if (stateName === 'mode' || stateName === 'source') {
      return { valueType: 'string' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'play',
        description: 'Start playback',
        commandType: 'pulse'
      },
      {
        name: 'pause',
        description: 'Pause playback',
        commandType: 'pulse'
      },
      {
        name: 'stop',
        description: 'Stop playback',
        commandType: 'pulse'
      },
      {
        name: 'next',
        description: 'Next track',
        commandType: 'pulse'
      },
      {
        name: 'previous',
        description: 'Previous track',
        commandType: 'pulse'
      },
      {
        name: 'volumeUp',
        description: 'Increase volume',
        commandType: 'pulse'
      },
      {
        name: 'volumeDown',
        description: 'Decrease volume',
        commandType: 'pulse'
      },
      {
        name: 'setVolume',
        description: 'Set volume level (0-100)',
        commandType: 'setValue',
        valueType: 'number',
        min: this.control.details?.min || 0,
        max: this.control.details?.max || 100,
        step: this.control.details?.step || 0.5,
      },
      {
        name: 'mute',
        description: 'Toggle mute',
        commandType: 'pulse'
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    const simpleCommands = ['play', 'pause', 'stop', 'next', 'previous', 'volumeUp', 'volumeDown', 'mute'];
    if (simpleCommands.includes(command)) {
      return `jdev/sps/io/${this.uuid}/${command}`;
    } else if (command === 'setVolume' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/volume/${value}`;
    }
    throw new Error(`Invalid command ${command} for AudioZone`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const power = statesToUse.find(s => s.name === 'power');
    const volume = statesToUse.find(s => s.name === 'volume');
    const muted = statesToUse.find(s => s.name === 'muted');
    let status = power?.value ? 'ON' : 'OFF';
    if (muted?.value) {
      status += ' (MUTED)';
    } else if (volume?.value !== undefined) {
      status += ` Vol:${volume.value}%`;
    }
    return `Audio Zone (${status})`;
  }
}