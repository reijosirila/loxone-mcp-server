import type { BinaryEvent } from '../types/api-responses.js';
import { bufferToUuid } from '../utils/index.js';
import { StateManager } from './StateManager.js';
import { ConnectionManager } from './ConnectionManager.js';
import { injectable } from 'tsyringe';
import { Logger } from '../../../utils/Logger.js';

/**
 * EventHandlerService processes real-time events from the Loxone Miniserver.
 * 
 * Responsibilities:
 * - Listens to WebSocket events from the ConnectionManager
 * - Processes binary event tables containing multiple state updates
 * - Handles individual value change events for controls
 * - Processes text events and updates for text-based controls
 * - Converts binary UUIDs to string format for state management
 * - Routes processed events to StateManager for storage
 * - Handles both numeric and text state updates
 * 
 * This service ensures all state changes from the Miniserver are captured
 * and stored for real-time monitoring and control synchronization.
 */
@injectable()
export class EventHandlerService  {
  constructor(private readonly stateManager: StateManager, private readonly connectionManager: ConnectionManager, private readonly logger: Logger) {
    // Route WebSocket events from connection to event handler
    this.connectionManager.on('event_table_values',  this.processEventTable.bind(this));
    this.connectionManager.on('event_table_text', this.processEventTableText.bind(this));
    this.connectionManager.on('event_value', this.processSingleEvent.bind(this));
    this.connectionManager.on('event_text', this.processTextEvent.bind(this));
  }
  
  public processEventTable(events: BinaryEvent[]): void {
    this.logger.debug('EventHandler', `Processing ${events.length} events from event table`);
    for (const event of events) {
      this.processSingleEvent(event);
    }
  }

  public processEventTableText(events: BinaryEvent[]): void {
    this.logger.debug('EventHandler', `Processing ${events.length} events from TEXT event table`);
    for (const event of events) {
      this.processTextEvent(event);
    }
  }

  public processSingleEvent(event: BinaryEvent): void {
    const uuid = bufferToUuid(event.uuid);
    if (uuid && event.value !== undefined) {
      this.stateManager.updateValue(uuid, event.value);
      this.logger.debug('EventHandler', `Stored value for ${uuid}: ${event.value}`);
    }
  }

  public processTextEvent(event: BinaryEvent): void {
    const uuid = bufferToUuid(event.uuid);
    if (uuid && event.text !== undefined) {
      this.stateManager.updateValue(uuid, event.text);
      this.logger.debug('EventHandler', `Stored text for ${uuid}: "${event.text}"`);
    }
  }
}