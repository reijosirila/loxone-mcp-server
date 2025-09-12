import { EventEmitter } from 'events';
import { injectable } from 'tsyringe';
import LoxoneClient from 'loxone-ts-api';
import type { LoxoneConfig, StructureFile } from '../types/structure.js';
import type { TextCommandResponse } from '../types/api-responses.js';
import { retry } from '../utils/index.js';
import { Logger } from '../../../utils/Logger.js';

type LoxoneConfigInternal = Omit<LoxoneConfig, 'serialNumber'>;

enum ConnectionState {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZED = 'INITIALIZED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

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
  private state: ConnectionState = ConnectionState.UNINITIALIZED;
  private structureLoaded: boolean = false;
  private structure: StructureFile | null = null;
  private options: LoxoneConfigInternal | null = null;
  private authHandler?: () => void;
  private errorHandler?: (reason: string) => void;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly AUTH_TIMEOUT_MS = 10000; // Increased from 5000

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
    this.client = new LoxoneClient(`${this.options.host}:${this.options.port}`, username, password, {
      autoReconnectEnabled: true,
      keepAliveEnabled: true,
      messageLogEnabled: false,
      logAllEvents: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logLevel: 'error' as any,
      maintainLatestEvents: false,
    });
    this.setupEventHandlers();
    this.state = ConnectionState.INITIALIZED;
    this.logger.info('ConnectionManager', 'Initialization complete');
    return this;
  }

  private setupEventHandlers() {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    this.client.on('connected', () => {
      this.logger.info('ConnectionManager', 'Connected');
      if (this.state === ConnectionState.CONNECTING) {
        this.state = ConnectionState.CONNECTED;
      }
      this.emit('connected');
    });

    this.client.on('disconnected', (reason: string) => {
      this.logger.warn('ConnectionManager', `Disconnected: ${reason}`);
      const wasConnected = this.state === ConnectionState.CONNECTED;
      this.state = ConnectionState.DISCONNECTED;
      this.emit('disconnected', reason);
      
      // Only attempt reconnect if we were previously connected
      if (wasConnected && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.handleReconnect();
      }
    });

    this.client.on('authenticated', () => {
      this.logger.info('ConnectionManager', 'Authenticated');
      this.reconnectAttempts = 0; // Reset on successful auth
      this.emit('authenticated');
    });

    // Forward all WebSocket events
    this.client.on('event_value', (data) => this.emit('event_value', data));
    this.client.on('event_text', (data) => this.emit('event_text', data));
  }

  public async connect() {
    try {
      if (!this.client || this.state === ConnectionState.UNINITIALIZED) {
        throw new Error('ConnectionManager not initialized. Call initialize() first.');
      }
      if (this.state === ConnectionState.CONNECTED) {
        this.logger.warn('ConnectionManager', 'Already connected');
        return this;
      }
      if (this.state === ConnectionState.CONNECTING) {
        this.logger.warn('ConnectionManager', 'Connection already in progress');
        return this;
      }
      
      this.state = ConnectionState.CONNECTING;
      this.logger.info('ConnectionManager', 'Connecting to Loxone...');
      // Create authentication promise
      const authPromise = new Promise<void>((resolve, reject) => {
        this.authHandler = () => {
          this.cleanupAuthHandlers();
          resolve();
        };
        this.errorHandler = (reason: string) => {
          this.cleanupAuthHandlers();
          reject(new Error(`Connection failed: ${reason}`));
        };
        
        if (!this.client) {
          reject(new Error('Client unexpectedly null'));
          return;
        }
        this.client.once('authenticated', this.authHandler);
        this.client.once('disconnected', this.errorHandler);
      });
      
      // Start connection
      await this.client.connect();
      
      // Wait for authentication with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          this.cleanupAuthHandlers();
          reject(new Error('Authentication timeout'));
        }, this.AUTH_TIMEOUT_MS);
      });
      
      await Promise.race([authPromise, timeoutPromise]);
      this.state = ConnectionState.CONNECTED;
      await this.enableUpdates();
      await this.loadStructure();
      return this;
    } catch (error) {
      this.state = ConnectionState.ERROR;
      this.logger.error('ConnectionManager', 'Connection failed:', error);
      throw error;
    }
  }
  
  private cleanupAuthHandlers(): void {
    if (this.client) {
      if (this.authHandler) {
        this.client.off('authenticated', this.authHandler);
        this.authHandler = undefined;
      }
      if (this.errorHandler) {
        this.client.off('disconnected', this.errorHandler);
        this.errorHandler = undefined;
      }
    }
  }
  
  private async handleReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff
    this.logger.info('ConnectionManager', `Attempting reconnect ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.logger.error('ConnectionManager', 'Reconnect failed:', error);
      }
    }, delay);
  }

  private async enableUpdates() {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    try {
      this.logger.info('ConnectionManager', 'Enabling binary updates...');
      await this.client.enableUpdates();
    } catch (error) {
      this.logger.error('ConnectionManager', 'Binary update enable failed:', error);
      throw error; // Let the caller handle reconnection
    }
  }

  private async loadStructure() {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    try {
      this.logger.info('ConnectionManager', 'Fetching structure file...');
      this.structure = await retry(
        () => {
          if (!this.client) {
            throw new Error('Client became null during retry');
          }
          return this.client.getStructureFile();
        },
        3,
        1000
      );
      this.logger.info('ConnectionManager', `Structure loaded. Found ${Object.keys(this.structure?.controls || {}).length} controls`);
      this.emit('structureLoaded', this.structure);
      this.structureLoaded = true;
    } catch (err) {
      this.logger.error('ConnectionManager', 'Failed to load structure:', err);
      throw err; // Let the caller handle reconnection
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
    if (this.state === ConnectionState.DISCONNECTING) {
      this.logger.warn('ConnectionManager', 'Already disconnecting');
      return;
    }
    
    this.state = ConnectionState.DISCONNECTING;
    this.cleanupAuthHandlers();
    this.removeAllListeners();
    
    if (this.client) {
      this.client.removeAllListeners();
      await this.client.disconnect();
      this.client = undefined;
    }
    this.state = ConnectionState.DISCONNECTED;
    this.structure = null;
    this.structureLoaded = false;
    this.reconnectAttempts = 0;
  }

  public isConnected() {
    return this.state === ConnectionState.CONNECTED;
  }

  public isStructureLoaded() {
    return this.structureLoaded;
  }

  public async sendCommand(command: string): Promise<TextCommandResponse> {
    if (!this.client) throw new Error('ConnectionManager not initialized');
    if (this.state !== ConnectionState.CONNECTED) throw new Error('Not connected to Loxone');
    return await this.client.sendTextCommand(command) as TextCommandResponse;
  }

  public async getStructure(): Promise<StructureFile> {
    if (!this.client) throw new Error('ConnectionManager not initialized');
    if (!this.structure) {
      await this.loadStructure();
      if (!this.structure) {
        throw new Error('Failed to load structure file');
      }
    }
    return this.structure;
  }
}