import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import 'reflect-metadata';
import { z } from 'zod';
import { container } from 'tsyringe';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Tool, registerTools, getToolsFromInstance, SERVER_INSTRUCTIONS } from '../../src/mcp-helpers/index.js';
import { Logger } from '../../src/utils/Logger.js';
import { LoxoneConnectionTools } from '../../src/tools/loxone.js';

class Demo {
  @Tool({ title: 'Echo', description: 'echoes', inputSchema: { text: z.string(), times: z.number().int().optional() }, annotations: { readOnlyHint: true } })
  echo(args: { text: string; times?: number }) {
    return { text: args.text.repeat(args.times ?? 1) };
  }

  @Tool({ description: 'always fails' })
  fail() {
    throw new Error('Control xyz not found');
  }
}

describe('MCP tool wiring', () => {
  let client: Client;
  let server: McpServer;
  const logger = { error: () => undefined, warn: () => undefined, info: () => undefined, debug: () => undefined } as unknown as Logger;

  async function connect(instance: object) {
    server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS });
    registerTools(server, instance, logger, 'Test');
    client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  }

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  it('lists decorated methods with schema and annotations', async () => {
    await connect(new Demo());
    const { tools } = await client.listTools();
    const echo = tools.find(t => t.name === 'echo');
    expect(echo).toMatchObject({ title: 'Echo', description: 'echoes', annotations: { readOnlyHint: true } });
    expect(echo?.inputSchema).toMatchObject({ type: 'object', properties: { text: { type: 'string' } } });
    expect(client.getInstructions()).toContain('Loxone');
  });

  it('calls tools and returns JSON results', async () => {
    await connect(new Demo());
    const result = await client.callTool({ name: 'echo', arguments: { text: 'ab', times: 2 } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual({ text: 'abab' });
  });

  it('reports handler failures as tool errors the model can read', async () => {
    await connect(new Demo());
    const result = await client.callTool({ name: 'fail', arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toBe('Error: Control xyz not found');
  });

  it('rejects invalid arguments', async () => {
    await connect(new Demo());
    const result = await client.callTool({ name: 'echo', arguments: { text: 5 } });
    expect(result.isError).toBe(true);
  });

  describe('LoxoneConnectionTools', () => {
    beforeEach(() => {
      if (!container.isRegistered('LoggerConfig')) {
        container.register('LoggerConfig', { useValue: { transport: 'http', level: 0 } });
      }
    });

    it('exposes the expected Loxone tools', async () => {
      const tools = getToolsFromInstance(new LoxoneConnectionTools({ host: '192.0.2.1', username: 'u', password: 'p' }));
      expect(tools.map(t => t.name).sort()).toEqual([
        'getCategories', 'getControl', 'getControls', 'getRooms', 'getStatistics', 'getSystemInfo', 'reloadStructure', 'setControl'
      ]);
      expect(tools.find(t => t.name === 'setControl')?.annotations?.readOnlyHint).toBe(false);
      expect(tools.find(t => t.name === 'getControls')?.annotations?.readOnlyHint).toBe(true);
    });

    it('answers with a readable error before the structure is loaded', async () => {
      await connect(new LoxoneConnectionTools({ host: '192.0.2.1', username: 'u', password: 'p' }));
      const result = await client.callTool({ name: 'getRooms', arguments: {} });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text: string }>)[0].text).toMatch(/not loaded yet/);
    });
  });
});
