 
import {
  ControlType,
  type ControlState,
  type ControlCommand,
  StateValue
} from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export abstract class AbstractControlType {
  protected _name: string;
  protected _room?: string;
  protected _category?: string;
  
  constructor(
    protected readonly uuid: string, 
    protected readonly control: LoxoneControl, 
    protected readonly type: ControlType, 
    protected readonly structure: LoxoneStructureFile, 
    protected readonly stateCache: Map<string, StateValue>
  ) {
    this._name = control.name;
    this._room = this.control.room ? this.structure.rooms?.[this.control.room]?.name : undefined;
    this._category = this.control.cat ? this.structure.cats?.[this.control.cat]?.name : undefined;
  }
  
  /**
   * Formats a specific state, providing its value type, unit, and an optional description.
   * This method is intended to be implemented by subclasses to define how each state
   * should be presented, especially for AI readability.
   * @param stateName The name of the state to format.
   * @param value The raw value of the state.
   * @returns An object containing the formatted state's valueType, unit, description, and value.
   */
  abstract formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value?: any;
  };

  /**
   * Returns the list of available commands that can be sent to this control for AI/user readability.
   * Each command includes details like name, description, command type, and any value requirements.
   * @returns Array of ControlCommand objects defining what operations this control supports.
   */
  abstract availableControlCommands(): ControlCommand[];
  
  /**
   * If command is triggered, this function generates a Loxone command string to control this type of control.
   * @param command The command name you defined with availableControlCommands (e.g., "on", "off", "setValue").
   * @param value Optional: The value associated with the command.
   * @returns The generated Loxone command string.
   * @see https://www.loxone.com/wp-content/uploads/datasheets/StructureFile.pdf
   * @see https://www.loxone.com/wp-content/uploads/datasheets/CommunicatingWithMiniserver.pdf
   */
  abstract buildControlCommand(command: string, value?: unknown): string;
  
  /**
   * Generates a human-readable summary of the control's current state eg "Temperature 25 degrees, target 24, mode Eco"
   * The summary should provide a concise description of what the control is currently doing
   * or its current status, formatted for AI/user readability.
   * this is fastest wy for AI to get information about control statuses.
   * @returns A string summarizing the control's current state and key information.
   */
  abstract generateSummary(): string;


  get name(): string {
    return this._name;
  }
  
  get room(): string | undefined {
    return this._room;
  }
  
  get category(): string | undefined {
    return this._category;
  }
  
  get commands(): ControlCommand[] {
    return this.availableControlCommands();
  }
  
  get hasStatistics(): boolean {
    return !!(this.control.statistic || this.control.statisticV2);
  }
  
  // Get formatted states for AI (filters out non-essential states)
  get formattedStates(): { [key: string]: unknown } {
    const result: { [key: string]: unknown } = {};
    const states = this.states || [];
    // States to ignore unless they're important
    const ignoredStates = [
      'jLocked', 'jLockable', 'error', 'errorCode', 'locked', 'config', 
      'serialNr', 'firmwareVersion', 'hardwareVersion', 'connectedInputs'
    ];
    
    // Important states to always include
    const importantStates = [
      'tempActual', 'tempTarget', 'currentMode', 'activeMode',
      'value', 'position', 'active', 'on', 'power', 'volume',
      'activeOutput', 'comfortTemperature', 'operatingMode',
      'textAndIcon', 'iconAndColor',
      'text', 'state', 'message', 'status'
    ];
    
    for (const state of states) {
      // Check if this state should be filtered
      if (this.shouldFilterState(state, ignoredStates, importantStates)) {
        continue;
      }
      
      // Add state with proper formatting
      const stateValue: Record<string, unknown> = {
        value: state.value,
        type: state.valueType
      };
      
      // Add unit if present
      if (state.unit) {
        stateValue.unit = state.unit;
      }
      result[state.name] = stateValue;
    }
    
    return result;
  }
  
  // Get formatted commands for AI
  get formattedCommands(): unknown[] {
    return this.commands.map(command => {
      const cmdInfo: Record<string, unknown> = {
        command: command.name,
        description: command.description,
        type: command.commandType
      };
      
      if (command.valueType) {
        cmdInfo.requiresValue = true;
        cmdInfo.valueType = command.valueType;
        if (command.min !== undefined) cmdInfo.min = command.min;
        if (command.max !== undefined) cmdInfo.max = command.max;
        if (command.step !== undefined) cmdInfo.step = command.step;
        if (command.enumValues) cmdInfo.options = command.enumValues;
      }
      return cmdInfo;
    });
  }

  protected get states() {
    const states: ControlState[] = [];
    if (!this.control.states) return [];
    for (const [stateName, stateUuid] of Object.entries(this.control.states)) {
      if (typeof stateUuid !== 'string') continue;
      // Get cached value - stateCache contains StateValue objects
      const cachedState = this.stateCache.get(stateUuid);
      const cachedValue = cachedState?.value;
      // Use control's own formatState method
      const stateConfig = this.formatState(stateName, cachedValue);
      states.push({
        name: stateName,
        uuid: stateUuid,
        value: stateConfig.value ?? cachedValue ?? null,
        valueType: stateConfig.valueType,
        unit: stateConfig.unit,
      });
    }
    return states;
  }
  
  // Override in specific control types for custom filtering
  protected shouldFilterState(state: ControlState, ignoredStates: string[], importantStates: string[]): boolean {
    // Always include important states
    const isImportant = importantStates.some(imp => 
      state.name.toLowerCase().includes(imp.toLowerCase())
    );
    
    // Skip null values unless it's an important state
    if (!isImportant && (state.value === null || state.value === undefined || state.value === '')) {
      return true;
    }
    
    // Skip ignored states unless marked as important
    if (!isImportant && ignoredStates.some(ignored => 
      state.name.toLowerCase().includes(ignored.toLowerCase())
    )) {
      return true;
    }
    
    // Skip config parameters unless important
    if (!isImportant && (state.name.includes('Config') || 
        state.name.includes('Setting') || 
        state.name.includes('Param') || 
        state.name.includes('Threshold'))) {
      return true;
    }
    
    return false;
  }

  getType(): ControlType {
    return this.type;
  }
  
  getControl(): LoxoneControl {
    return this.control;
  }
  
  getUuid(): string {
    return this.uuid;
  }
  
  // Get full formatted data for AI
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      uuid: this.uuid,
      name: this.name,
      type: this.type,
      room: this.room,
      category: this.category,
      hasStatistics: this.hasStatistics,
      currentStates: this.formattedStates,
      availableCommands: this.formattedCommands,
      summary: this.generateSummary()
    };
    
    // Add type-specific data
    const typeSpecific = this.getTypeSpecificData();
    if (typeSpecific) {
      Object.assign(result, typeSpecific);
    }
    
    return result;
  }
  
  // Override in specific control types to add type-specific data
  protected getTypeSpecificData(): Record<string, unknown> | null {
    return null;
  }
}