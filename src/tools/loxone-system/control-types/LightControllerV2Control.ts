 
import { AbstractControlType } from './AbstractControlType.js';
import { ControlState, ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile, LoxoneSubControl } from '../types/control-structure.js';

export class LightControllerV2Control extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.LightControllerV2, structure, stateCache);
  }
  
  
  formatState(stateName: string, value: unknown) {
    return { valueType: typeof value as any || 'boolean' };
  }

  public get hasColorPicker(): boolean {
    return !!this.control?.details?.masterColor || !!(!!this.control?.subControls && Object.values(this.control.subControls).some((sub) => sub.type === ControlType.ColorPicker || sub.type === ControlType.ColorPickerV2));
  }
  
  availableControlCommands(): ControlCommand[] {
    const commands: ControlCommand[] = [
      {
        name: 'on',
        description: 'Turn on',
        commandType: 'pulse'
      },
      {
        name: 'off',
        description: 'Turn off',
        commandType: 'pulse'
      }
    ];
    
    // If it has a ColorPickerV2 subcontrol, add color commands
    if (this.hasColorPicker) {
      commands.push(
        {
          name: 'hsv',
          description: 'Set RGB color. Use "0,100,100" for red, "120,100,100" for green, "240,100,100" for blue',
          commandType: 'hsv',
          valueType: 'string'
        },
        {
          name: 'temp',
          description: 'Set warm/cool white. Use "100,2700" for warm, "100,6500" for cool',
          commandType: 'temp',
          valueType: 'string'
        },
        {
          name: 'setBrightness',
          description: 'Set brightness level from 0 to 100',
          commandType: 'setBrightness',
          valueType: 'number',
          min: this.control.details?.min || 0,
          max: this.control.details?.max || 100,
          step: this.control.details?.step || 0.5,
        }
      );
    }
    return commands;
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'on' || command === 'off') {
      return `jdev/sps/io/${this.uuid}/${command}`;
    } else if (command === 'hsv' || command === 'temp' || command === 'setBrightness') {
      // Forward color commands to ColorPickerV2 subcontrol
      let colorPickerUuid: string | undefined;
      
      // First check for masterColor in details
      if (this.control?.details?.masterColor) {
        colorPickerUuid = this.control.details.masterColor;
      } 
      // Otherwise look for ColorPickerV2 in subControls
      else if (this.control?.subControls) {
        const colorPickerEntry = Object.entries(this.control.subControls).find(
          ([_, subControl]: [string, unknown]) => (subControl as LoxoneSubControl).type === 'ColorPickerV2'
        );
        if (colorPickerEntry) {
          colorPickerUuid = colorPickerEntry[0];
        }
      }
      
      if (colorPickerUuid) {
        if (command === 'setBrightness' && !!value) {
          return `jdev/sps/io/${colorPickerUuid}/setBrightness/${value}`;
        } else if (command === 'hsv' && !!value) {
          const hsvString = value.toString().replace(/[()]/g, '');
          return `jdev/sps/io/${colorPickerUuid}/hsv(${hsvString})`;
        } else if (command === 'temp' && !!value) {
          const tempString = value.toString().replace(/[()]/g, '');
          return `jdev/sps/io/${colorPickerUuid}/temp(${tempString})`;
        } else {
          throw new Error(`Missing value for ${command} command`);
        }
      } else {
        throw new Error(`LightControllerV2 ${this.uuid} does not have color control capability`);
      }
    }
    throw new Error(`Invalid command ${command} for LightControllerV2`);
  }
  
  generateSummary() {
    if (this.hasColorPicker) {
      return `RGB Light Controller - use 'hsv' command with color code (eg. "0,100,100" for red)`;
    }
    return `Light Controller V2`;
  }
  
  // Add RGB instructions if this controller has color capability
  protected getTypeSpecificData() {
    if (this.hasColorPicker) {
      return {
        rgbInstructions: {
          toTurnRed: 'Use command "hsv" with value "0,100,100"',
          toTurnGreen: 'Use command "hsv" with value "120,100,100"',
          toTurnBlue: 'Use command "hsv" with value "240,100,100"',
          toSetWarmWhite: 'Use command "temp" with value "100,2700"',
          toSetCoolWhite: 'Use command "temp" with value "100,6500"',
          note: 'You can use these commands directly on the LightControllerV2 UUID'
        }
      };
    }
    return null;
  }

  // Override to filter out redundant mode states and unnecessary states
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    // States to always filter out for room controllers
    const roomControllerIgnored = [
      'activeMoods', 'moodList', 'activeMoodsNum', 'circuitNames', 'daylightConfig', 'presence'
    ];
    if (roomControllerIgnored.includes(state.name)) {
      return true;
    }
    // Use parent class filtering for everything else
    return super.shouldFilterState(state, ignoredStates, importantStates);
  }
}