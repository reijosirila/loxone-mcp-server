import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import 'reflect-metadata';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Tool } from '../../src/mcp-helpers/index.js';
import { LoxoneHttpServer } from '../../src/http-server.js';

class FakeLoxoneTools {
  public opened = 0;
  public closed = 0;

  async open() {
    this.opened += 1;
  }

  async close() {
    this.closed += 1;
  }

  @Tool({ description: 'answers pong', annotations: { readOnlyHint: true } })
  ping() {
    return { pong: true };
  }
}

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: 'http-test-client', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

describe('LoxoneHttpServer (stateless Streamable HTTP)', () => {
  const tools = new FakeLoxoneTools();
  let server: LoxoneHttpServer;
  let url: string;

  beforeAll(async () => {
    server = new LoxoneHttpServer({}, 0, tools);
    await server.start();
    url = `http://127.0.0.1:${server.address!.port}/mcp`;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('opens the Loxone connection once on start', () => {
    expect(tools.opened).toBe(1);
  });

  it('serves several clients that each initialize their own session', async () => {
    for (let i = 0; i < 3; i += 1) {
      const client = await connectClient(url);
      const list = await client.listTools();
      expect(list.tools.map(t => t.name)).toEqual(['ping']);
      const result = await client.callTool({ name: 'ping', arguments: {} });
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual({ pong: true });
      await client.close();
    }
  });

  it('handles concurrent clients', async () => {
    const clients = await Promise.all([connectClient(url), connectClient(url), connectClient(url)]);
    const results = await Promise.all(clients.map(c => c.callTool({ name: 'ping', arguments: {} })));
    expect(results).toHaveLength(3);
    await Promise.all(clients.map(c => c.close()));
  });

  it('rejects GET and DELETE with 405 in stateless mode', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(url, { method, headers: { Accept: 'application/json, text/event-stream' } });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });

  it('answers the health endpoint without auth', async () => {
    const res = await fetch(url.replace('/mcp', '/health'));
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe('ok');
  });
});
