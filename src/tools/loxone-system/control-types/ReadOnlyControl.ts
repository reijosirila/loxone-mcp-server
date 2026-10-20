import { AbstractControlType } from './AbstractControlType.js';
import type { ControlCommand } from '../types/structure.js';

/** Base for controls that only report state (sensors, monitors, counters). */
export abstract class ReadOnlyControl extends AbstractControlType {
  availableControlCommands(): ControlCommand[] {
    return [];
  }

  buildControlCommand(command: string): string {
    throw new Error(`${this.type} '${this.name}' is read-only and accepts no commands (got '${command}')`);
  }
}
