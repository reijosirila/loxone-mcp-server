import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand, type ControlState } from '../types/structure.js';
import { extractUnit, formatLoxoneValue } from '../utils/index.js';
import { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class IRoomControllerV2Control extends AbstractControlType {
  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    const type = control.type === 'IRoomController' ? ControlType.IRoomController : ControlType.IRoomControllerV2;
    super(uuid, control, type, structure, stateCache);
  }
  
  formatState(stateName: string, value: any): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
    value?: any;
  } {
    // Try to get unit from Loxone's format string first
    const format = this.control.details?.format;
    const unit = extractUnit(format);
    const newValue = (stateName === 'currentMode' || stateName === 'activeMode' || stateName === 'operatingMode') 
      ? this.getModeText(value, stateName)
      : value;
    // For temperature states, use format unit or default to °C
    if (stateName.toLowerCase().includes('temp')) {
      return {
        valueType: 'number',
        unit: unit || '°C',
        value: newValue
      };
    }
    if (stateName === 'mode' || stateName === 'operatingMode') {
      return { valueType: 'number', value: newValue };
    }
    if (stateName === 'active' || stateName === 'on' || typeof value === 'boolean') {
      return { valueType: 'boolean', value: newValue };
    }
    return { 
      valueType: typeof value as any || 'number',
      value: newValue,
      unit
    };
  }
  
  availableControlCommands(): ControlCommand[] {
    const commands: ControlCommand[] = [];
    
    // Get timer modes from details
    const timerModes = this.control.details?.timerModes || [];
    const modeOptions = timerModes.map((mode: any) => ({
      value: mode.id,
      label: mode.name
    }));
    
    commands.push({
      name: 'setTemperature',
      description: 'Set target temperature',
      commandType: 'setValue',
      valueType: 'number',
      min: this.control.details?.min || 0,
      max: this.control.details?.max || 35,
      step: this.control.details?.step || 0.5,
    });
    
    if (modeOptions.length > 0) {
      commands.push({
        name: 'setMode',
        description: 'Set operating mode',
        commandType: 'setEnum',
        enumValues: modeOptions
      });
    }
    
    return commands;
  }
  
  buildControlCommand(command: string, value?: unknown): string {
    if (command === 'setTemperature' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/setComfortTemperature/${value}`;
    } else if (command === 'setMode' && value !== undefined) {
      return `jdev/sps/io/${this.uuid}/setOperatingMode/${value}`;
    }
    throw new Error(`Invalid command ${command} for Room Controller`);
  }
  
  generateSummary() {
    const statesToUse = this.states;
    const format = this.control.details?.format;
    const temp = statesToUse.find(s => s.name === 'tempActual');
    const target = statesToUse.find(s => s.name === 'tempTarget');
    // Prefer activeMode over currentMode/operatingMode for accuracy
    let mode = statesToUse.find(s => s.name === 'activeMode');
    if (!mode) {
      mode = statesToUse.find(s => s.name === 'currentMode' || s.name === 'operatingMode');
    }
    const modeText = this.getModeText(mode?.value, mode?.name);
    
    const tempFormatted = temp?.value !== undefined 
      ? formatLoxoneValue(format || '%.1f°C', temp.value)
      : '?°C';
    const targetFormatted = target?.value !== undefined
      ? formatLoxoneValue(format || '%.1f°C', target.value)
      : '?°C';
    
    return `Room ${tempFormatted} (target ${targetFormatted}, mode: ${modeText})`;
  }
  
  // Override to filter out redundant mode states and unnecessary states
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    // States to always filter out for room controllers
    const roomControllerIgnored = [
      'averageOutdoorTemp', 'temperatureBoundaryInfo', 'capabilities', 'openWindow',
      'frostProtectTemperature', 'heatProtectTemperature', 'humidityActual', 
      'actualOutdoorTemp', 'shadingOut', 'prepareState', 'useOutdoor', 
      'overrideReason', 'excessEnergyTempOffset', 'co2', 'CO2', 'overrideEntries'
    ];
    
    if (roomControllerIgnored.includes(state.name)) {
      return true;
    }
    
    // For room controllers with activeMode, skip currentMode and operatingMode to avoid confusion
    const hasActiveMode = this.states.some(s => s.name === 'activeMode');
    if (hasActiveMode && (state.name === 'currentMode' || state.name === 'operatingMode')) {
      return true;
    }

    // Use parent class filtering for everything else
    return super.shouldFilterState(state, ignoredStates, importantStates);
  }


  // Default implementation for getting mode text
  private getModeText(modeValue: unknown, stateName?: string): string {
    if (modeValue === undefined || modeValue === null) return 'unknown';
    
    // Default mode mappings for room controllers
    const modeMap: { [key: number]: string } = {
      0: 'Eco',
      1: 'Comfort',
      2: 'Building Protection',
      3: 'Manual',
      4: 'Off'
    };
    
    // For activeMode, always use the simple mapping
    if (stateName === 'activeMode') {
      return typeof modeValue === 'number' ? (modeMap[modeValue] || `mode ${modeValue}`) : String(modeValue);
    }
    
    // Check if control has timer modes in details
    if (this.control.details?.timerModes) {
      const mode = this.control.details.timerModes.find((m) => m.id === modeValue);
      if (mode) return mode.name || mode.description || (typeof modeValue === 'number' ? modeMap[modeValue] : undefined) || `mode ${modeValue}`;
    }
    
    return typeof modeValue === 'number' ? (modeMap[modeValue] || `mode ${modeValue}`) : String(modeValue);
  }
}