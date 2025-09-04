/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class TextStateControl extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.TextState, structure, stateCache);
  }
  
  formatState(stateName: string, value: string|number): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
    value?: string|number;
  } {
    let newValue = value;
    // Only transform if value is numeric - don't overwrite text values
    if (value !== null && value !== undefined && !isNaN(Number(value)) && typeof value === 'number') {
      const index = Number(value);
      const entries = this.control.details?.entries;
      if (entries && entries[index] !== undefined) {
        newValue = entries[index];
      }
    }
    if (stateName === 'textAndIcon' || stateName === 'text' || 
        stateName === 'message' || stateName === 'status' || stateName === 'state') {
      return { valueType: 'string', value: newValue };
    }
    if (stateName === 'iconAndColor') {
      return { valueType: 'object', value: newValue };
    }
    return { valueType: 'string', value: newValue };
  }
  
  availableControlCommands(): ControlCommand[] {
    // TextState controls are read-only
    return [];
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    throw new Error(`TextState controls are read-only`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    // Check multiple possible state names for text value
    const possibleTextStates = [
      'textAndIcon',    // Primary documented state
      'text',           // Simple text state
      'value',          // Generic value state
      'state',          // Generic state
      'message',        // Message state
      'status'          // Status state
    ];
    
    let displayText = 'N/A';
    let foundState = null;
    
    // Try to find text in any of the possible state names
    for (const stateName of possibleTextStates) {
      const state = statesToUse.find(s => s.name === stateName);
      if (state && state.value !== null && state.value !== undefined && state.value !== '') {
        let textValue = state.value;
        
        // Only transform numeric values if we have entries - don't overwrite text
        if (this.control.details?.entries && typeof textValue === 'number' && !isNaN(Number(textValue))) {
          const index = Number(textValue);
          const entries = this.control.details.entries;
          if (entries[index] !== undefined) {
            textValue = entries[index];
          }
        }
        
        displayText = String(textValue);
        foundState = stateName;
        break;
      }
    }
    
    // Also check iconAndColor for additional info
    const iconAndColor = statesToUse.find(s => s.name === 'iconAndColor');
    let iconInfo = '';
    if (iconAndColor && iconAndColor.value) {
      try {
        const iconData = typeof iconAndColor.value === 'string' 
          ? JSON.parse(iconAndColor.value) 
          : iconAndColor.value;
        if (iconData.icon) {
          iconInfo = ` [icon]`;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
    
    // Escape quotes in text for JSON safety
    const escapedText = String(displayText).replace(/"/g, '\\"');
    return `Display: ${escapedText}${iconInfo}`;
  }
}