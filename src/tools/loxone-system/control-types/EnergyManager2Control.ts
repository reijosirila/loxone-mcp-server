/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbstractControlType } from './AbstractControlType.js';
import { ControlType, StateValue, type ControlCommand } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';

export class EnergyManager2Control extends AbstractControlType {
  private hasSsoc: boolean = false;
  private hasSpwr: boolean = false;

  constructor(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>) {
    super(uuid, control, ControlType.EnergyManager2, structure, stateCache);

    // Parse control details if available
    if (control.details) {
      this.hasSsoc = control.details.HasSsoc === true;
      this.hasSpwr = control.details.HasSpwr === true;
    }
  }

  formatState(stateName: string, value: unknown): {
    valueType: 'number' | 'boolean' | 'string' | 'object';
    unit?: string;
  } {
    switch (stateName) {
      case 'Gpwr':  // Grid Power
      case 'Spwr':  // Storage Power
      case 'Ppwr':  // Production Power
      case 'MaxSpwr':  // Max Storage Power
        return { valueType: 'number', unit: 'kW' };
      case 'Ssoc':  // Storage State of Charge
      case 'MinSoc':  // Minimum Storage State of Charge
        return { valueType: 'number', unit: '%' };
      case 'loads':
        return { valueType: 'object' };
      default:
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
    throw new Error(`Invalid command ${command} for Energy Manager Gen. 2`);
  }

  generateSummary(): string {
    const states = this.states;
    const gridPower = states.find(s => s.name === 'Gpwr');
    const storagePower = states.find(s => s.name === 'Spwr');
    const productionPower = states.find(s => s.name === 'Ppwr');
    const storageSOC = states.find(s => s.name === 'Ssoc');

    const statusParts = [];

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

    // Production power
    if (productionPower?.value && typeof productionPower.value === 'number' && productionPower.value > 0) {
      statusParts.push(`Production: ${productionPower.value.toFixed(1)}kW`);
    }

    // Storage information
    if (this.hasSpwr && storagePower?.value && typeof storagePower.value === 'number') {
      if (storagePower.value > 0) {
        statusParts.push(`Storage Charging: ${storagePower.value.toFixed(1)}kW`);
      } else if (storagePower.value < 0) {
        statusParts.push(`Storage Discharging: ${Math.abs(storagePower.value).toFixed(1)}kW`);
      }
    }

    // Storage SOC
    if (this.hasSsoc && storageSOC?.value && typeof storageSOC.value === 'number') {
      statusParts.push(`SOC: ${Math.round(storageSOC.value)}%`);
    }

    const status = statusParts.length > 0 ? statusParts.join(', ') : 'No data';
    return `Energy Manager (${status})`;
  }
}