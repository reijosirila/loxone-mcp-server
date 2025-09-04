/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class CentralWindowControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.CentralWindow, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    // Central controls don't have states
    return { valueType: 'string' };
  }
  
  availableControlCommands(): ControlCommand[] {
    return [
      {
        name: 'toggle',
        description: 'Toggle all windows',
        commandType: 'pulse'
      },
      {
        name: 'fullOpen',
        description: 'Fully open all windows',
        commandType: 'pulse'
      },
      {
        name: 'fullClose',
        description: 'Fully close all windows',
        commandType: 'pulse'
      },
      {
        name: 'moveToPosition',
        description: 'Move all windows to position',
        commandType: 'setValue',
        valueType: 'number',
        min: this.control.details?.min || 0,
        max: this.control.details?.max || 100,
        step: this.control.details?.step || 0.5,
      }
    ];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'toggle' || command === 'fullOpen' || command === 'fullClose') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    } else if (command === 'moveToPosition' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/moveToPosition/${value}`;
    } else if (command === 'open' || command === 'close') {
      // open/[on/off] and close/[on/off] format
      if (value === 'on' || value === 'off') {
        return `jdev/sps/io/${this.uuid}/${command}/${value}`;
      }
    }
    throw new Error(`Invalid command ${command} for CentralWindow`);
  }
  
  generateSummary() {
    const linkedCount = this.control.details?.controls?.length || 0;
    return `Central Window (${linkedCount} windows)`;
  }
  
  // Override to not show states for central controls
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    return true;
  }
}