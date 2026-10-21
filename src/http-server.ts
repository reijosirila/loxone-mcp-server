import 'reflect-metadata';
import type { LoxoneConfig } from './tools/loxone-system/types/structure.js';
import { Logger, LogLevel, type LoggerConfig } from './utils/Logger.js';
import { container } from 'tsyringe';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LoxoneConnectionTools } from './tools/index.js';
import { registerTools, SERVER_INFO, SERVER_INSTRUCTIONS } from './mcp-helpers/index.js';
import express from 'express';
import { createAuthMiddleware, createJsonMiddleware, createJsonErrorHandler } from './http-middlewares/index.js';

// Register Logger configuration for HTTP transport
const loggerConfig: LoggerConfig = {
  transport: 'http', // Use http transport type
  level: Number(process.env.LOG_LEVEL || LogLevel.INFO)
};
// logger it is important to load logger first, so we don't have unexpected console.log
container.register<LoggerConfig>('LoggerConfig', { useValue: loggerConfig });
container.resolve(Logger);

/** The Loxone-facing tool provider: a connection lifecycle plus @Tool-decorated methods. */
export interface ToolProvider {
  open(): Promise<void>;
  close(): Promise<void>;
}

export class LoxoneHttpServer {
  private loxone: ToolProvider;
  private logger: Logger;
  private app: express.Application;
  private httpServer?: ReturnType<express.Application['listen']>;
  private readonly port: number;
  private readonly apiKey?: string;

  constructor(config: Partial<LoxoneConfig>, port?: number, tools?: ToolProvider) {
    this.logger = container.resolve(Logger);
    this.loxone = tools ?? new LoxoneConnectionTools(config);
    this.port = port ?? (Number(process.env.PORT || process.env.MCP_PORT) || 3000);
    this.apiKey = process.env.MCP_API_KEY;
    this.app = express();
    this.setupExpressHandlers();
  }

  /** The port the HTTP server is bound to; resolves the OS-assigned port after start() when 0 was requested. */
  public get address(): { port: number } | undefined {
    const addr = this.httpServer?.address();
    return addr && typeof addr === 'object' ? { port: addr.port } : undefined;
  }

  private setupExpressHandlers(): void {
    // JSON parsing with error handling
    this.app.use(createJsonMiddleware(this.logger));
    this.app.use(createJsonErrorHandler(this.logger));
    // Register authentication middleware for all /mcp routes
    this.app.use('/mcp', createAuthMiddleware(this.apiKey, this.logger));
    this.app.post('/mcp', async (req, res) => {
      this.logger.info('LoxoneHttpServer', `POST /mcp from ${req.ip}`);
      this.logger.debug('LoxoneHttpServer', `MCP ${req.method} request:`, {
        method: req.method,
        headers: req.headers,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        body: req.body ? JSON.stringify(req.body).substring(0, 500) : 'empty'
      });
      res.on('finish', () => {
        this.logger.debug('LoxoneHttpServer', `Response finished: status=${res.statusCode}`);
      });
      // A stateless StreamableHTTPServerTransport accepts exactly one initialize, so every
      // request gets its own server + transport pair; sharing one across requests makes the
      // second client's initialize fail with HTTP 500 (and concurrent requests interleave).
      const server = new McpServer(SERVER_INFO, {
        capabilities: { tools: {} },
        instructions: SERVER_INSTRUCTIONS,
      });
      registerTools(server, this.loxone, this.logger, 'LoxoneHttpServer');
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        this.logger.error('LoxoneHttpServer', 'MCP request failed:', error instanceof Error ? error.message : error);
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
      }
    });
    // Stateless mode has no server-initiated stream and no session to terminate.
    const methodNotAllowed = (req: express.Request, res: express.Response) => {
      this.logger.info('LoxoneHttpServer', `${req.method} /mcp from ${req.ip}`);
      res.status(405).set('Allow', 'POST').json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed: this server is stateless, use POST' },
        id: null,
      });
    };
    this.app.get('/mcp', methodNotAllowed);
    this.app.delete('/mcp', methodNotAllowed);
    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      this.logger.info('LoxoneHttpServer', `GET /health from ${req.ip}`);
      res.json({ status: 'ok', name: 'loxone-mcp-server', version: process.env.npm_package_version || 'unknown' });
    });
  }

  public async start(): Promise<void> {
    // Connect to Loxone first
    this.logger.info('LoxoneHttpServer', 'Connecting to Loxone...');
    await this.loxone.open();
    this.logger.info('LoxoneHttpServer', 'Connected to Loxone');
    // Log if API key protection is enabled
    if (this.apiKey) {
      this.logger.info('LoxoneHttpServer', 'API key authentication enabled');
    } else {
      this.logger.warn('LoxoneHttpServer', 'API key authentication disabled - server is publicly accessible');
    }
    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer = this.app.listen(this.port, () => {
        this.logger.info('LoxoneHttpServer', `MCP HTTP server listening on ::${this.address?.port ?? this.port}/mcp`);
        this.httpServer!.removeListener('error', reject);
        resolve();
      });
      this.httpServer.once('error', reject);
    });
  }

  public async stop(): Promise<void> {
    this.logger.info('LoxoneHttpServer', 'Shutting down...');
    // Close connections
    await Promise.all([
       new Promise<void>((resolve) => {
        if (this.httpServer) {
          this.httpServer.closeAllConnections();
          this.httpServer.close(() => resolve());
        }
        else resolve();
      }),
      this.loxone.close(),
    ]);
    this.logger.info('LoxoneHttpServer', 'Shutdown complete');
  }
}
