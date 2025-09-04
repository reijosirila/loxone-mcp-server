import { EventEmitter } from 'events';
import { injectable, inject } from 'tsyringe';
import LoxoneClient from 'loxone-ts-api';
import type { LoxoneConfig, StructureFile } from '../types/structure.js';
import type { TextCommandResponse } from '../types/api-responses.js';
import { retry } from '../utils/index.js';
import { Logger } from '../../utils/Logger.js';

/**
 * ConnectionManager handles the WebSocket connection to the Loxone Miniserver.
 * 
 * Responsibilities:
 * - Establishes and maintains WebSocket connection to Loxone Miniserver
 * - Retrieves and caches the Miniserver structure file
 * - Sends commands to the Miniserver and receives responses
 * - Emits connection lifecycle events (connected, disconnected, error)
 * - Provides methods to check connection status and retrieve server information
 * 
 * This service is the core communication layer between the MCP server and Loxone system.
 */
@injectable()
export class ConnectionManager extends EventEmitter {
  private client: LoxoneClient;
  private connected: boolean = false;
  private structure: StructureFile | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(@inject('LoxoneConfig') private readonly config: LoxoneConfig, private readonly logger: Logger) {
    super();
    this.client = new LoxoneClient(
      this.config.host,
      this.config.username,
      this.config.password,
      true, // autoReconnectEnabled
      true  // keepAliveEnabled
    );
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connected', async () => {
      this.logger.info('ConnectionManager', 'Connected');
      this.connected = true;
      this.emit('connected');
    });

    this.client.on('disconnected', async (reason: string) => {
      this.logger.warn('ConnectionManager', `Disconnected: ${reason}`);
      this.connected = false;
      this.emit('disconnected', reason);
    });

    this.client.on('authenticated', async () => {
      this.logger.info('ConnectionManager', 'Authenticated');
      this.emit('authenticated');
    });

    // Forward all WebSocket events
    this.client.on('event_table_values', (data) => this.emit('event_table_values', data));
    this.client.on('event_table_text', (data) => this.emit('event_table_text', data));
    this.client.on('event_value', (data) => this.emit('event_value', data));
    this.client.on('event_text', (data) => this.emit('event_text', data));
  }

  public async connect(): Promise<void> {
    try {
      this.logger.info('ConnectionManager', 'Connecting to Loxone...');
      
      // Create authentication promise
      const authPromise = new Promise<void>((resolve, reject) => {
        const authHandler = () => {
          this.client.off('authenticated', authHandler);
          this.client.off('disconnected', errorHandler);
          resolve();
        };
        const errorHandler = (reason: string) => {
          this.client.off('authenticated', authHandler);
          this.client.off('disconnected', errorHandler);
          reject(new Error(`Connection failed: ${reason}`));
        };
        
        this.client.once('authenticated', authHandler);
        this.client.once('disconnected', errorHandler);
      });
      // Start connection
      await this.client.connect();
      // Wait for authentication with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Authentication timeout')), 5000);
      });
      await Promise.race([authPromise, timeoutPromise]);
      await this.enableUpdates();
      await this.loadStructure();
    } catch (error) {
      this.logger.error('ConnectionManager', 'Connection failed:', error);
      throw error;
    }
  }

  private async enableUpdates(): Promise<void> {
    try {
      this.logger.info('ConnectionManager', 'Enabling binary updates...');
      await this.client.enableUpdates();
    } catch (error) {
      this.logger.error('ConnectionManager', 'Binary update enable failed:', error);
      await this.client.disconnect();
      await this.client.connect();
    }
  }

  private async loadStructure(): Promise<void> {
    try {
    this.logger.info('ConnectionManager', 'Fetching structure file...');
    this.structure = await retry(
      () => this.client.getStructureFile(),
      3,
      1000
    );
    this.logger.info('ConnectionManager', `Structure loaded. Found ${Object.keys(this.structure?.controls || {}).length} controls`);
    this.emit('structureLoaded', this.structure);
    } catch (err) {
      this.logger.error('ConnectionManager', 'Failed to load structure:', err);
      await this.client.disconnect();
      await this.client.connect();
    }
  }

  public async close(): Promise<void> {
    this.removeAllListeners();
    this.client.removeAllListeners();
    await this.client.disconnect();
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async sendCommand(command: string): Promise<TextCommandResponse> {
    if (!this.connected) {
      throw new Error('Not connected to Loxone');
    }
    return await this.client.sendTextCommand(command) as TextCommandResponse;
  }

  public async getStructure(): Promise<StructureFile> {
    if (!this.structure) {
      await this.loadStructure();
    }
    return this.structure!;
  }

  public getCurrentStructure(): StructureFile | null {
    return this.structure;
  }
}