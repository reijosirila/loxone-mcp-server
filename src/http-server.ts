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

export class LoxoneHttpServer {
  private server: McpServer;
  private transport: StreamableHTTPServerTransport;
  private loxone: LoxoneConnectionTools;
  private logger: Logger;
  private app: express.Application;
  private httpServer?: ReturnType<express.Application['listen']>;
  private readonly port: number;
  private readonly apiKey?: string;

  constructor(config: Partial<LoxoneConfig>, port?: number) {
    this.logger = container.resolve(Logger);
    this.loxone = new LoxoneConnectionTools(config);
    this.port = port || Number(process.env.PORT || process.env.MCP_PORT) || 3000;
    this.apiKey = process.env.MCP_API_KEY;
    this.server = new McpServer(SERVER_INFO, {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
    });
    // Initialize MCP transport
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    // Create Express app
    this.app = express();
    this.setupMcpHandlers();
    this.setupExpressHandlers();
  }

  private setupMcpHandlers(): void {
    registerTools(this.server, this.loxone, this.logger, 'LoxoneHttpServer');
  }

  private setupExpressHandlers(): void {
    // JSON parsing with error handling
    this.app.use(createJsonMiddleware(this.logger));
    this.app.use(createJsonErrorHandler(this.logger));
    // Register authentication middleware for all /mcp routes
    this.app.use('/mcp', createAuthMiddleware(this.apiKey, this.logger));
    // Setup routes  
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
        await this.transport.handleRequest(req, res, req.body);
      }
    );
    //
    this.app.get('/mcp', async (req, res) => {
        this.logger.info('LoxoneHttpServer', `GET /mcp from ${req.ip}`);
        await this.transport.handleRequest(req, res, undefined);
      }
    );
    //
    this.app.delete('/mcp', async (req, res) => {
        this.logger.info('LoxoneHttpServer', `DELETE /mcp from ${req.ip}`);
        await this.transport.handleRequest(req, res, req.body);
      }
    );
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
    // Connect MCP server to transport before starting HTTP server
    await this.server.connect(this.transport);
    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer = this.app.listen(this.port, () => {
        this.logger.info('LoxoneHttpServer', `MCP HTTP server listening on ::${this.port}/mcp`);
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
      this.server.close()
    ]);
    this.logger.info('LoxoneHttpServer', 'Shutdown complete');
  }
}