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
  private readonly boundProcessEvent: (event: BinaryEvent) => void;
  private readonly boundProcessTextEvent: (event: BinaryEvent) => void;
  private isListening = false;

  constructor(
    private readonly stateManager: StateManager, 
    private readonly connectionManager: ConnectionManager, 
    private readonly logger: Logger
  ) {
    // Create bound functions once to allow proper cleanup
    this.boundProcessEvent = this.processEvent.bind(this);
    this.boundProcessTextEvent = this.processTextEvent.bind(this);
    this.startListening();
  }

  private startListening(): void {
    if (this.isListening) return;
    // Route WebSocket events from connection to event handler
    this.connectionManager.on('event_value', this.boundProcessEvent);
    this.connectionManager.on('event_text', this.boundProcessTextEvent);
    this.isListening = true;
    this.logger.debug('EventHandler', 'Started listening to events');
  }

  public processEvent(event: BinaryEvent): void {
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

  /**
   * Clean up event listeners to prevent memory leaks
   */
  public cleanup(): void {
    if (!this.isListening) return;
    this.connectionManager.off('event_value', this.boundProcessEvent);
    this.connectionManager.off('event_text', this.boundProcessTextEvent);
    this.isListening = false;
    this.logger.debug('EventHandler', 'Stopped listening to events');
  }
}