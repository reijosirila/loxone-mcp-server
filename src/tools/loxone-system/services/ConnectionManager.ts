import { EventEmitter } from 'events';
import { injectable } from 'tsyringe';
import LoxoneClient from 'loxone-ts-api';
import type { LoxoneConfig, StructureFile } from '../types/structure.js';
import type { TextCommandResponse } from '../types/api-responses.js';
import { retry } from '../utils/index.js';
import { Logger } from '../../../utils/Logger.js';

export enum ConnectionState {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZED = 'INITIALIZED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CLOSED = 'CLOSED'
}

export interface ConnectionInfo {
  state: ConnectionState;
  miniserverUrl?: string;
  structureLoaded: boolean;
  structureLastModified?: string;
  lastDisconnectReason?: string;
  lastError?: string;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
const SERIAL_NUMBER_PATTERN = /^(?:[0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * ConnectionManager owns the loxone-ts-api client.
 *
 * The client keeps the WebSocket alive on its own (keepalive, token refresh and an
 * endless auto-reconnect loop that re-enables binary updates), so this class only
 * mirrors the client's state, loads the structure file and forwards state events.
 */
@injectable()
export class ConnectionManager extends EventEmitter {
  private client?: LoxoneClient;
  private state: ConnectionState = ConnectionState.UNINITIALIZED;
  private structure: StructureFile | null = null;
  private baseUrl: URL | null = null;
  private credentials: { username: string; password: string } | null = null;
  private connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS;
  private lastDisconnectReason?: string;
  private lastError?: string;

  constructor(private readonly logger: Logger) {
    super();
  }

  public static buildBaseUrl(host: string, port?: number, protocol?: 'http' | 'https'): URL {
    const trimmed = host.trim().replace(/\/+$/, '');
    if (!trimmed) {
      throw new Error('Loxone host must not be empty');
    }
    if (SERIAL_NUMBER_PATTERN.test(trimmed)) {
      throw new Error(`'${trimmed}' looks like a Miniserver serial number. Set LOXONE_SERIAL_NUMBER instead of LOXONE_HOST to use cloud discovery.`);
    }
    const url = URL_SCHEME_PATTERN.test(trimmed)
      ? new URL(trimmed)
      : new URL(`${protocol ?? 'http'}://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported protocol '${url.protocol.replace(':', '')}', use http or https`);
    }
    if (port && !url.port) {
      url.port = String(port);
    }
    return url;
  }

  public initialize(config: Partial<LoxoneConfig>) {
    this.logger.info('ConnectionManager', 'Initializing...');
    const { host, port, protocol, username, password, connectTimeoutMs } = config;
    if (!host || !username || !password) {
      throw new Error('Loxone host, username and password must be provided');
    }
    if (protocol && !['http', 'https'].includes(protocol)) {
      throw new Error('Unsupported protocol');
    }
    this.baseUrl = ConnectionManager.buildBaseUrl(host, port, protocol);
    this.credentials = { username, password };
    if (connectTimeoutMs && connectTimeoutMs > 0) {
      this.connectTimeoutMs = connectTimeoutMs;
    }
    this.client = new LoxoneClient(this.baseUrl.origin, username, password, {
      autoReconnectEnabled: true,
      keepAliveEnabled: true,
      messageLogEnabled: false,
      logAllEvents: false,
      maintainLatestEvents: false,
    });
    this.client.setLogLevel('error');
    this.setupEventHandlers();
    this.state = ConnectionState.INITIALIZED;
    this.logger.info('ConnectionManager', `Initialized for ${this.baseUrl.origin}`);
    return this;
  }

  private setupEventHandlers() {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    this.client.on('ready', () => {
      void this.onReady();
    });
    this.client.on('disconnected', (reason: string) => {
      if (this.state === ConnectionState.CLOSED) return;
      this.logger.warn('ConnectionManager', `Disconnected: ${reason}`);
      this.lastDisconnectReason = reason;
      this.state = ConnectionState.DISCONNECTED;
      this.emit('disconnected', reason);
    });
    // An unhandled 'error' event would crash the process; the client reconnects on its own.
    this.client.on('error', (error: Error) => {
      this.lastError = error.message;
      this.logger.error('ConnectionManager', `Connection error: ${error.message}`);
    });
    this.client.on('event_value', (data) => this.emit('event_value', data));
    this.client.on('event_text', (data) => this.emit('event_text', data));
  }

  private async onReady(): Promise<void> {
    const isReconnect = this.state === ConnectionState.DISCONNECTED;
    this.state = ConnectionState.CONNECTED;
    this.logger.info('ConnectionManager', isReconnect ? 'Reconnected' : 'Connected');
    this.emit('connected');
    if (!isReconnect) return;
    try {
      // Binary updates are re-enabled by the client itself; only the structure may be stale.
      if (this.structure) {
        await this.refreshStructureIfChanged();
      } else {
        await this.enableUpdates();
        await this.loadStructure();
      }
    } catch (error) {
      this.logger.error('ConnectionManager', 'Post-reconnect refresh failed:', error);
    }
  }

  public async connect() {
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
    this.logger.info('ConnectionManager', `Connecting to ${this.baseUrl?.origin}...`);
    const ready = this.waitForReady(this.connectTimeoutMs);
    // Not awaited: with auto-reconnect enabled this promise only settles once a connection succeeds.
    this.client.connect().catch((error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('ConnectionManager', 'Connect failed:', error);
    });
    try {
      await ready;
      await this.enableUpdates();
      await this.loadStructure();
      await this.waitForInitialStates();
      return this;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('ConnectionManager', 'Connection failed:', error);
      throw error;
    }
  }

  private waitForReady(timeoutMs: number): Promise<void> {
    const client = this.client;
    if (!client) return Promise.reject(new Error('Client not initialized'));
    if (this.isClientReady()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        client.off('ready', onReady);
        const detail = this.lastError ? ` (last error: ${this.lastError})` : '';
        reject(new Error(`Miniserver at ${this.baseUrl?.origin} did not become ready within ${timeoutMs}ms${detail}`));
      }, timeoutMs);
      client.once('ready', onReady);
    });
  }

  /**
   * After enabling binary updates the Miniserver streams the current value of every
   * state. Wait until that burst goes quiet so the first tool call sees real values.
   */
  private waitForInitialStates(quietMs = 500, maxMs = 5000): Promise<void> {
    const client = this.client;
    if (!client) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let quietTimer: NodeJS.Timeout;
      const done = () => {
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        client.off('event_value', bump);
        client.off('event_text', bump);
        resolve();
      };
      const bump = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      };
      const maxTimer = setTimeout(done, maxMs);
      quietTimer = setTimeout(done, quietMs);
      client.on('event_value', bump);
      client.on('event_text', bump);
    });
  }

  private isClientReady(): boolean {
    return (this.client?.state as string | undefined) === 'ready';
  }

  private async enableUpdates() {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    this.logger.info('ConnectionManager', 'Enabling binary updates...');
    await this.client.enableUpdates();
  }

  private async loadStructure() {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
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
  }

  private async refreshStructureIfChanged() {
    const response = await this.sendCommand('jdev/sps/LoxAPPversion3');
    const remoteVersion = response.value === undefined ? '' : String(response.value);
    if (!remoteVersion || remoteVersion === this.structure?.lastModified) {
      this.logger.debug('ConnectionManager', 'Structure unchanged since last load');
      return;
    }
    this.logger.info('ConnectionManager', `Structure changed (${this.structure?.lastModified} -> ${remoteVersion}), reloading`);
    await this.loadStructure();
  }

  // Gen1 Miniservers handle very few concurrent HTTP connections and can take a long
  // time to serve large files, so requests run one at a time with a hard timeout.
  private fetchChain: Promise<unknown> = Promise.resolve();
  private readonly FETCH_TIMEOUT_MS = 60000;

  public async fetch(path: string, timeoutMs?: number): Promise<Response> {
    if (!this.baseUrl || !this.credentials) {
      throw new Error('ConnectionManager not initialized');
    }
    const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
    const url = new URL(path.startsWith('/') ? path.slice(1) : path, this.baseUrl);
    const timeout = timeoutMs ?? this.FETCH_TIMEOUT_MS;
    const run = async (): Promise<Response> => {
      try {
        return await fetch(url, { headers: { 'Authorization': `Basic ${auth}` }, signal: AbortSignal.timeout(timeout) });
      } catch (err) {
        this.logger.warn('ConnectionManager', `HTTP fetch failed/timeout for ${path}:`, err);
        throw new Error(`Miniserver HTTP request failed or timed out (${timeout}ms): ${path}`);
      }
    };
    const result = this.fetchChain.then(run, run);
    this.fetchChain = result.catch(() => undefined);
    return result;
  }

  /**
   * Re-downloads data/LoxAPP3.json over plain HTTP so new controls become visible without a restart.
   * HTTP carries its own credentials, so this also works while the WebSocket is reconnecting
   * after a config deploy or reboot. Falls back to the WebSocket when HTTP fails.
   */
  public async reloadStructure(): Promise<number> {
    try {
      const response = await this.fetch('data/LoxAPP3.json', 120000);
      if (!response.ok) {
        throw new Error(`Miniserver returned HTTP ${response.status} for data/LoxAPP3.json`);
      }
      const structure = JSON.parse(await response.text()) as StructureFile;
      if (!structure || !structure.controls) {
        throw new Error('Structure file parsed but contains no controls');
      }
      this.structure = structure;
      this.emit('structureLoaded', this.structure);
      this.logger.info('ConnectionManager', `Structure reloaded via HTTP. ${Object.keys(structure.controls).length} controls`);
      return Object.keys(structure.controls).length;
    } catch (httpErr) {
      this.logger.warn('ConnectionManager', 'HTTP structure reload failed, trying websocket:', httpErr);
      await this.loadStructure();
      return Object.keys(this.structure?.controls || {}).length;
    }
  }

  public async close() {
    if (this.state === ConnectionState.CLOSED) {
      return;
    }
    this.state = ConnectionState.CLOSED;
    this.removeAllListeners();
    if (this.client) {
      const client = this.client;
      this.client = undefined;
      client.removeAllListeners();
      client.on('error', () => undefined);
      try {
        await client.disconnect();
      } catch (error) {
        this.logger.warn('ConnectionManager', 'Error while disconnecting:', error);
      }
    }
    this.structure = null;
  }

  public isConnected() {
    return this.state === ConnectionState.CONNECTED && this.isClientReady();
  }

  public isStructureLoaded() {
    return this.structure !== null;
  }

  public getConnectionInfo(): ConnectionInfo {
    return {
      state: this.state,
      miniserverUrl: this.baseUrl?.origin,
      structureLoaded: this.structure !== null,
      structureLastModified: this.structure?.lastModified,
      lastDisconnectReason: this.lastDisconnectReason,
      lastError: this.lastError,
    };
  }

  public async sendCommand(command: string): Promise<TextCommandResponse> {
    if (!this.client) throw new Error('ConnectionManager not initialized');
    if (!this.isConnected()) throw new Error('Not connected to Loxone');
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
