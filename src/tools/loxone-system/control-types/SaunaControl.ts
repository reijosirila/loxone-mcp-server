/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class SaunaControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Sauna, structure, stateCache);
  }

  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    switch (stateName) {
      case 'tempActual':
      case 'tempTarget':
      case 'tempBench':
        return { valueType: 'number', unit: '°C' };
      case 'timer':
      case 'timerTotal':
      case 'elapsedTime':
        return { valueType: 'number', unit: 'seconds' };
      case 'humidityActual':
      case 'humidityTarget':
        return { valueType: 'number', unit: '%' };
      case 'power':
      case 'active':
      case 'fan':
      case 'drying':
      case 'doorClosed':
      case 'presence':
      case 'error':
      case 'lessWater':
      case 'saunaError':
        return { valueType: 'boolean' };
      case 'mode':
      case 'operatingMode':
      case 'status':
        return { valueType: 'string' };
      default:
        const valueType = typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'object'
          ? typeof value as 'number' | 'boolean' | 'string' | 'object'
          : 'number';
        return { valueType };
    }
  }

  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'on',
        description: 'Turn sauna on',
        commandType: 'pulse'
      },
      {
        name: 'off',
        description: 'Turn sauna off',
        commandType: 'pulse'
      },
      {
        name: 'fan-on',
        description: 'Turn FAN off',
        commandType: 'pulse'
      },
      {
        name: 'fan-off',
        description: 'Turn FAN off',
        commandType: 'pulse'
      },
      {
        name: 'setTemperature',
        description: 'Set target temperature',
        commandType: 'setValue',
        valueType: 'number',
        min: 40,
        max: 110,
        step: 1
      }
    ];
  }

  buildControlCommand(command: string, value?: unknown): string {
    switch (command) {
      case 'on':
        return `jdev/sps/io/${this.uuid}/on`;
      case 'off':
        return `jdev/sps/io/${this.uuid}/off`;
      case 'fan-on':
        return `jdev/sps/io/${this.uuid}/fanon`;
      case 'fan-off':
        return `jdev/sps/io/${this.uuid}/fanoff`;
      case 'setTemperature':
        if (value !== undefined && typeof value === 'number') {
          return `jdev/sps/io/${this.uuid}/temp/${value}`;
        }
      default:
        throw new Error(`Invalid command ${command} for Sauna`);
    }
  }

  generateSummary(): string {
    const states = this.states;
    const active = states.find(s => s.name === 'active' || s.name === 'on');
    const tempActual = states.find(s => s.name === 'tempActual');
    const tempTarget = states.find(s => s.name === 'tempTarget');
    const humidityActual = states.find(s => s.name === 'humidityActual');
    const humidityTarget = states.find(s => s.name === 'humidityTarget');
    const mode = states.find(s => s.name === 'mode' || s.name === 'operatingMode');
    const heatingActive = states.find(s => s.name === 'power');
    const timer = states.find(s => s.name === 'timer');
    const doorClosed = states.find(s => s.name === 'doorClosed');
    const presence = states.find(s => s.name === 'presence');
    const error = states.find(s => s.name === 'error' || s.name === 'saunaError');
    const lessWater = states.find(s => s.name === 'lessWater');
    const fan = states.find(s => s.name === 'fan');

    if (!active?.value) {
      return 'Sauna (OFF)';
    }
    const statusParts = [];
    // Temperature info
    if (tempActual?.value && typeof tempActual.value === 'number') {
      if (tempTarget?.value && typeof tempTarget.value === 'number') {
        statusParts.push(`Temperature ${tempActual.value}°C → ${tempTarget.value}°C`);
      } else {
        statusParts.push(`Temperature ${tempActual.value}°C`);
      }
    } else if (tempTarget?.value && typeof tempTarget.value === 'number') {
      statusParts.push(`Temperature target: ${tempTarget.value}°C`);
    }
    // humidityTarget info
    if (humidityActual?.value && typeof humidityActual.value === 'number') {
      if (humidityTarget?.value && typeof humidityTarget.value === 'number') {
        statusParts.push(`Humidity ${humidityActual.value}% → ${humidityActual.value}%`);
      } else {
        statusParts.push(`Humidity ${humidityActual.value}%`);
      }
    } else if (tempTarget?.value && typeof tempTarget.value === 'number') {
      statusParts.push(`Humidity target: ${tempTarget.value}°C`);
    }
    if (doorClosed) {
      statusParts.push('DOOR CLOSED');
    }
    if (presence) {
      statusParts.push('PRESENCE');
    }
    if (error) {
      statusParts.push('ERROR');
    }
    if (lessWater) {
      statusParts.push('Evaporator runs out of water');
    }

    // Timer info
    if (timer?.value && typeof timer.value === 'number' && timer.value > 0) {
      statusParts.push(`${timer.value/60}min left`);
    }

    if (heatingActive?.value) {
      statusParts.push('HEATING');
    }
    if (fan?.value) {
      statusParts.push('Airing phase');
    }

    // Mode
    if (mode?.value && typeof mode.value === 'string') {
      statusParts.push(mode.value.toUpperCase());
    }

    const status = statusParts.length > 0 ? statusParts.join(', ') : 'Unknown';
    return `Sauna (${status})`;
  }
}