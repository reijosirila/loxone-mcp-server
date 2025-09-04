/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class RadioControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.Radio, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'activeOutput' || stateName === 'value') {
      return { valueType: 'number' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    const commands: ControlCommand[] = [];
    
    if (this.control.details?.outputs) {
      const outputs = this.control.details.outputs;
      Object.entries(outputs).forEach(([id, label]) => {
        const outputId = parseInt(id);
        commands.push({
          name: `select/${outputId}`,
          description: `Select ${label}`,
          commandType: 'setValue'
        });
      });
    }
    
    // Add reset command to deselect all
    commands.push({
      name: 'reset',
      description: 'Deselect all outputs (All Off)',
      commandType: 'pulse'
    });
    
    return commands;
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command.startsWith('select/')) {
      const outputId = command.substring(7);
      return `jdev/sps/io/${this.uuid}/${outputId}`;
    } else if (command === 'reset') {
      return `jdev/sps/io/${this.uuid}/reset`;
    } else if (command.match(/^\d+$/)) {
      // Direct ID command for backward compatibility
      return `jdev/sps/io/${this.uuid}/${command}`;
    }
    throw new Error(`Invalid command ${command} for Radio. Use select/N or reset`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const activeOutput = statesToUse.find(s => s.name === 'activeOutput');
    
    let outputName = 'none';
    if (activeOutput?.value !== undefined) {
      if (activeOutput.value === 0) {
        // 0 means all off
        const allOff = this.control.details?.allOff;
        outputName = typeof allOff === 'string' ? allOff : 'All Off';
      } else if (this.control.details?.outputs && typeof activeOutput.value === 'number' && this.control.details.outputs[activeOutput.value]) {
        // Get the output name from the outputs map
        outputName = this.control.details.outputs[activeOutput.value as number];
      } else {
        // Fallback to output ID
        outputName = `Output ${activeOutput.value}`;
      }
    }
    
    return `Radio Selector (${outputName})`;
  }
}