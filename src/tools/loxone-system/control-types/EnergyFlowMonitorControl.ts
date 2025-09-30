/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

interface EFMNode {
  uuid: string;
  nodeType: 'Grid' | 'Storage' | 'Production' | 'Load' | 'Wallbox' | 'Group';
  title: string;
  icon?: string;
  actualEfmState?: string;
  ctrlUuid?: string;
  nodes?: EFMNode[];
}

export class EnergyFlowMonitorControl extends AbstractControlType {
  private nodes: EFMNode[] = [];

  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.EnergyFlowMonitor, structure, stateCache);

    // Parse nodes from control details if available
    if (control.details?.nodes) {
      this.nodes = Array.isArray(control.details.nodes) ? control.details.nodes : [];
    }
  }

  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    switch (stateName) {
      case 'Ppwr':  // Production Power
      case 'Gpwr':  // Grid Power
      case 'Spwr':  // Storage Power
        return { valueType: 'number', unit: 'kW' };
      case 'CO2':  // CO2 Factor
        return { valueType: 'number', unit: 'kg/kWh' };
      default:
        // Handle actualN states (actual0, actual1, etc.)
        if (stateName.startsWith('actual')) {
          return { valueType: 'number', unit: 'kW' };
        }
        const valueType = typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'object'
          ? typeof value as 'number' | 'boolean' | 'string' | 'object'
          : 'number';
        return { valueType };
    }
  }

  availableControlCommands(): ControlCommand[] {
    return [];
  }

  buildControlCommand(command: string, value?: unknown): string {
    throw new Error(`Invalid command ${command} for Energy Flow Monitor`);
  }

  generateSummary(): string {
    const states = this.states;
    const productionPower = states.find(s => s.name === 'Ppwr');
    const gridPower = states.find(s => s.name === 'Gpwr');
    const storagePower = states.find(s => s.name === 'Spwr');
    const co2Factor = states.find(s => s.name === 'CO2');
    const actualStates = states.filter(s => s.name.startsWith('actual'));

    const statusParts = [];

    // Production power
    if (productionPower?.value && typeof productionPower.value === 'number' && productionPower.value > 0) {
      statusParts.push(`Production: ${productionPower.value.toFixed(1)}kW`);
    }

    // Grid power
    if (gridPower?.value && typeof gridPower.value === 'number') {
      if (gridPower.value > 0) {
        statusParts.push(`Grid Import: ${gridPower.value.toFixed(1)}kW`);
      } else if (gridPower.value < 0) {
        statusParts.push(`Grid Export: ${Math.abs(gridPower.value).toFixed(1)}kW`);
      } else {
        statusParts.push('Grid: Balanced');
      }
    }

    // Storage power
    if (storagePower?.value && typeof storagePower.value === 'number') {
      if (storagePower.value > 0) {
        statusParts.push(`Storage Charging: ${storagePower.value.toFixed(1)}kW`);
      } else if (storagePower.value < 0) {
        statusParts.push(`Storage Discharging: ${Math.abs(storagePower.value).toFixed(1)}kW`);
      }
    }

    // Actual states (actualN nodes) - map to node titles
    if (actualStates.length > 0) {
      for (let i = 0; i < actualStates.length; i++) {
        const state = actualStates[i];
        const title = this.nodes[i]?.title ?? 'Unknown';
        if (state.value && typeof state.value === 'number') {
          statusParts.push(`${title}: ${state.value.toFixed(1)}kW`);
        }
      }
    }

    // CO2 factor
    if (co2Factor?.value && typeof co2Factor.value === 'number') {
      statusParts.push(`CO2: ${co2Factor.value.toFixed(3)}kg/kWh`);
    }

    const status = statusParts.length > 0 ? statusParts.join(', ') : 'No data';
    return `Energy Flow Monitor (${status})`;
  }
}