import { EventEmitter } from 'events';
import { injectable } from 'tsyringe';
import LoxoneClient from 'loxone-ts-api';
import type { LoxoneConfig, StructureFile } from '../types/structure.js';
import type { TextCommandResponse } from '../types/api-responses.js';
import { retry } from '../utils/index.js';
import { Logger } from '../../../utils/Logger.js';
import assert from 'assert';

type LoxoneConfigInternal = Omit<LoxoneConfig, 'serialNumber'>;
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
  private client?: LoxoneClient;
  private connected: boolean = false;
  private structureLoaded: boolean = false;
  private structure: StructureFile | null = null;
  private options: LoxoneConfigInternal | null = null;

  constructor(private readonly logger: Logger) {
    super();
  }

  public initialize(config: Partial<LoxoneConfig>) {
    this.logger.info('ConnectionManager', 'Initializing...');
    const { host, port, protocol, wsProtocol, username, password } = config;
    if (!host || !username || !password) {
      throw new Error('Loxone host, port username and password must be provided');
    }
    if (protocol && !['http', 'https'].includes(protocol)) {
      throw new Error('Unsupported protocol');
    }
    if (wsProtocol && !['ws', 'wss'].includes(wsProtocol)) {
      throw new Error('Unsupported WebSocket protocol');
    }
    if (protocol === 'https' || wsProtocol === 'wss') {
      throw new Error('HTTPS/WSS protocol is not supported');
    }
    this.options = {
      host,
      port: port || 80,
      protocol: protocol || 'http',
      wsProtocol: wsProtocol || 'ws',
      username,
      password,
    };
    this.client = new LoxoneClient(`${this.options.host}:${this.options.port}`, username, password, true, true);
    this.setupEventHandlers();
    this.logger.info('ConnectionManager', 'Initialization complete');
    return this;
  }

  private setupEventHandlers() {
    assert(this.client); // private method
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

  public async connect() {
    try {
      if (!this.client) {
        throw new Error('ConnectionManager not initialized. Call initialize() first.');
      }
      if (this.connected) {
        this.logger.warn('ConnectionManager', 'Already connected');
        return this;
      }
      this.logger.info('ConnectionManager', 'Connecting to Loxone...');
      // Create authentication promise
      const authPromise = new Promise<void>((resolve, reject) => {
        const authHandler = () => {
          assert(this.client);
          this.client.off('authenticated', authHandler);
          this.client.off('disconnected', errorHandler);
          resolve();
        };
        const errorHandler = (reason: string) => {
          assert(this.client);
          this.client.off('authenticated', authHandler);
          this.client.off('disconnected', errorHandler);
          reject(new Error(`Connection failed: ${reason}`));
        };
        assert(this.client);
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
      return this;
    } catch (error) {
      this.logger.error('ConnectionManager', 'Connection failed:', error);
      throw error;
    }
  }

  private async enableUpdates() {
    assert(this.client); // private method
    try {
      this.logger.info('ConnectionManager', 'Enabling binary updates...');
      await this.client.enableUpdates();
    } catch (error) {
      this.logger.error('ConnectionManager', 'Binary update enable failed:', error);
      await this.client.disconnect();
      await this.client.connect();
    }
  }

  private async loadStructure() {
    assert(this.client);  // private method
    try {
      this.logger.info('ConnectionManager', 'Fetching structure file...');
      this.structure = await retry(
        () =>{
          assert(this.client);
          return this.client.getStructureFile()
        },
        3,
        1000
      );
      this.logger.info('ConnectionManager', `Structure loaded. Found ${Object.keys(this.structure?.controls || {}).length} controls`);
      this.emit('structureLoaded', this.structure);
      this.structureLoaded = true;
    } catch (err) {
      this.logger.error('ConnectionManager', 'Failed to load structure:', err);
      await this.client.disconnect();
      await this.client.connect();
    }
  }

  public async fetch(path: string) {
    if (!this.options) {
      throw new Error('ConnectionManager not initialized');
    }
    const baseUrl = `${this.options.protocol}://${this.options.host}:${this.options.port}`;
    const auth = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64');
    const url = `${baseUrl}/${path.startsWith('/') ? path.slice(1) : path}`;
    const headers = { 'Authorization': `Basic ${auth}` };
    const response = await fetch(url, { headers });
    return response;
  }

  public async close() {
    this.removeAllListeners();
    this.client?.removeAllListeners();
    await this.client?.disconnect();
    this.client = undefined;
    this.connected = false;
  }

  public isConnected() {
    return this.connected;
  }

  public isStructureLoaded() {
    return this.structureLoaded;
  }

  public async sendCommand(command: string): Promise<TextCommandResponse> {
    if (!this.client) throw new Error('ConnectionManager not initialized')
    if (!this.connected) throw new Error('Not connected to Loxone');
    return await this.client.sendTextCommand(command) as TextCommandResponse;
  }

  public async getStructure(): Promise<StructureFile> {
    if (!this.client) throw new Error('ConnectionManager not initialized')
    if (!this.structure) {
      await this.loadStructure();
    }
    return this.structure!;
  }
}