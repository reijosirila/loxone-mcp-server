 
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class LightController extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.LightController, structure, stateCache);
  }
  
  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    if (stateName === 'activeScene') {
      return { valueType: 'number' };
    }
    if (stateName === 'sceneList') {
      return { valueType: 'string' };
    }
    if (stateName === 'active' || stateName === 'on' || typeof value === 'boolean') {
      return { valueType: 'boolean' };
    }
    return { valueType: typeof value as 'number' | 'boolean' | 'string' | 'object' || 'number' };
  }
  
  availableControlCommands(): ControlCommand[] {
    const commands: ControlCommand[] = [
      {
        name: 'on',
        description: 'All lights on (scene 9)',
        commandType: 'pulse'
      },
      {
        name: 'off',
        description: 'All lights off (scene 0)',
        commandType: 'pulse'
      },
      {
        name: 'setScene',
        description: 'Activate a specific scene (0-9)',
        commandType: 'setValue',
        valueType: 'number',
        min: 0,
        max: 9,
        step: 1
      },
      {
        name: 'plus',
        description: 'Switch to next scene',
        commandType: 'pulse'
      },
      {
        name: 'minus',
        description: 'Switch to previous scene',
        commandType: 'pulse'
      }
    ];
    return commands;
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'on') {
      return `jdev/sps/io/${this.uuid}/on`;
    } else if (command === 'off') {
      return `jdev/sps/io/${this.uuid}/off`;
    } else if (command === 'setScene' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/${value}`;
    } else if (command === 'plus') {
      return `jdev/sps/io/${this.uuid}/plus`;
    } else if (command === 'minus') {
      return `jdev/sps/io/${this.uuid}/minus`;
    } else if (command === 'learnScene' && value !== undefined) {
      // Value should be in format "sceneNumber,sceneName"
      const [sceneNum, sceneName] = value ? value.toString().split(',') : ['', ''];
      return `jdev/sps/io/${this.uuid}/${sceneNum}/learn/${sceneName || ''}`;
    }
    throw new Error(`Invalid command ${command} for LightController`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const activeScene = statesToUse.find(s => s.name === 'activeScene');
    const sceneList = statesToUse.find(s => s.name === 'sceneList');
    
    let summary = `Light Controller`;
    if (activeScene?.value !== undefined) {
      summary += ` (Scene ${activeScene.value})`;
    }
    
    // Parse scene list if available
    if (sceneList?.value) {
      try {
        // Parse format like "1=\"Scene1\",2=\"Scene2\""
        const scenes = sceneList.value.toString()
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s)
          .map((s: string) => {
            const match = s.match(/(\d+)="([^"]+)"/);
            return match ? `${match[1]}:${match[2]}` : null;
          })
          .filter(Boolean)
          .slice(0, 3); // Show max 3 scenes
        
        if (scenes.length > 0) {
          summary += ` [${scenes.join(', ')}${scenes.length < 3 ? '' : '...'}]`;
        }
      } catch {
        // Ignore parsing errors
      }
    }
    
    return summary;
  }
  
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    // Always show activeScene and sceneList
    if (state.name === 'activeScene' || state.name === 'sceneList') {
      return false;
    }
    
    return super.shouldFilterState(state, ignoredStates, importantStates);
  }
}