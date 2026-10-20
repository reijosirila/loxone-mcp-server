import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import 'reflect-metadata';
import { EventEmitter } from 'events';
import { ConnectionManager, ConnectionState } from '../../../src/tools/loxone-system/services/ConnectionManager.js';
import { Logger } from '../../../src/utils/Logger.js';

type MockStructure = { lastModified: string; controls: Record<string, unknown>; rooms: Record<string, unknown>; cats: Record<string, unknown> };

class MockClient extends EventEmitter {
  state = 'disconnected';
  connect = jest.fn<() => Promise<void>>(async () => undefined);
  enableUpdates = jest.fn<() => Promise<void>>(async () => undefined);
  getStructureFile = jest.fn<() => Promise<MockStructure>>(async () => ({ lastModified: 'v1', controls: { a: {} }, rooms: {}, cats: {} }));
  sendTextCommand = jest.fn<(command: string) => Promise<{ code: number; value: string }>>(async () => ({ code: 200, value: 'v1' }));
  disconnect = jest.fn<() => Promise<void>>(async () => undefined);
  setLogLevel = jest.fn();

  becomeReady() {
    this.state = 'ready';
    this.emit('ready');
  }
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager;
  let client: MockClient;
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as Logger;
  const config = { host: '192.168.1.10', username: 'u', password: 'p', connectTimeoutMs: 200 };

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ConnectionManager(logger);
    manager.initialize(config);
    client = new MockClient();
    // Replace the real library client with the mock and re-wire the event handlers
    (manager as unknown as { client: MockClient }).client = client;
    (manager as unknown as { setupEventHandlers: () => void }).setupEventHandlers();
  });

  describe('buildBaseUrl', () => {
    it('defaults to http for IPs and hostnames', () => {
      expect(ConnectionManager.buildBaseUrl('192.168.1.10').origin).toBe('http://192.168.1.10');
      expect(ConnectionManager.buildBaseUrl('miniserver.local', 8080).origin).toBe('http://miniserver.local:8080');
      expect(ConnectionManager.buildBaseUrl('miniserver.local', 443, 'https').origin).toBe('https://miniserver.local');
    });

    it('keeps full URLs and only adds a port when missing', () => {
      expect(ConnectionManager.buildBaseUrl('https://example.dyndns.org:7443/').origin).toBe('https://example.dyndns.org:7443');
      expect(ConnectionManager.buildBaseUrl('https://example.dyndns.org', 8443).origin).toBe('https://example.dyndns.org:8443');
    });

    it('rejects serial numbers and unsupported schemes', () => {
      expect(() => ConnectionManager.buildBaseUrl('504F94123456')).toThrow(/LOXONE_SERIAL_NUMBER/);
      expect(() => ConnectionManager.buildBaseUrl('ftp://host')).toThrow(/Unsupported protocol/);
      expect(() => ConnectionManager.buildBaseUrl('  ')).toThrow(/empty/);
    });
  });

  describe('connect', () => {
    it('waits for ready, enables updates and loads the structure', async () => {
      const structureLoaded = jest.fn();
      manager.on('structureLoaded', structureLoaded);
      client.connect.mockImplementation(async () => { setImmediate(() => client.becomeReady()); });

      await manager.connect();

      expect(client.enableUpdates).toHaveBeenCalledTimes(1);
      expect(client.getStructureFile).toHaveBeenCalledTimes(1);
      expect(structureLoaded).toHaveBeenCalledWith(expect.objectContaining({ lastModified: 'v1' }));
      expect(manager.isConnected()).toBe(true);
      expect(manager.isStructureLoaded()).toBe(true);
      expect(manager.getConnectionInfo()).toMatchObject({ state: ConnectionState.CONNECTED, miniserverUrl: 'http://192.168.1.10', structureLastModified: 'v1' });
    });

    it('fails with a clear error when the Miniserver does not become ready in time', async () => {
      await expect(manager.connect()).rejects.toThrow(/did not become ready within 200ms/);
      expect(manager.isConnected()).toBe(false);
      expect(client.enableUpdates).not.toHaveBeenCalled();
    });

    it('does not crash on client error events', () => {
      expect(() => client.emit('error', new Error('socket hang up'))).not.toThrow();
      expect(manager.getConnectionInfo().lastError).toBe('socket hang up');
    });
  });

  describe('reconnect handling', () => {
    beforeEach(async () => {
      client.connect.mockImplementation(async () => { setImmediate(() => client.becomeReady()); });
      await manager.connect();
    });

    it('reports disconnects and reloads a changed structure after the client reconnects', async () => {
      const connected = jest.fn();
      manager.on('connected', connected);
      client.state = 'disconnected';
      client.emit('disconnected', 'Closed with code 1006');

      expect(manager.isConnected()).toBe(false);
      expect(manager.getConnectionInfo()).toMatchObject({ state: ConnectionState.DISCONNECTED, lastDisconnectReason: 'Closed with code 1006' });

      client.sendTextCommand.mockResolvedValueOnce({ code: 200, value: 'v2' });
      client.getStructureFile.mockResolvedValueOnce({ lastModified: 'v2', controls: {}, rooms: {}, cats: {} });
      client.becomeReady();
      await new Promise(resolve => setImmediate(resolve));

      expect(manager.isConnected()).toBe(true);
      expect(connected).toHaveBeenCalledTimes(1);
      expect(client.sendTextCommand).toHaveBeenCalledWith('jdev/sps/LoxAPPversion3');
      expect(client.getStructureFile).toHaveBeenCalledTimes(2);
      expect(manager.getConnectionInfo().structureLastModified).toBe('v2');
    });

    it('keeps the structure when it is unchanged after a reconnect', async () => {
      client.state = 'disconnected';
      client.emit('disconnected', 'network');
      client.becomeReady();
      await new Promise(resolve => setImmediate(resolve));

      expect(client.getStructureFile).toHaveBeenCalledTimes(1);
      expect(manager.isConnected()).toBe(true);
    });

    it('rejects commands while disconnected', async () => {
      client.state = 'disconnected';
      client.emit('disconnected', 'network');
      await expect(manager.sendCommand('jdev/sps/io/x/on')).rejects.toThrow('Not connected to Loxone');
    });
  });

  it('close disconnects the client and ignores later events', async () => {
    await manager.close();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(manager.getConnectionInfo().state).toBe(ConnectionState.CLOSED);
    expect(() => client.emit('disconnected', 'bye')).not.toThrow();
  });
});
