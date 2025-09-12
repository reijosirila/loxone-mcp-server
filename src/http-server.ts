import 'reflect-metadata';
import type { LoxoneConfig } from './tools/loxone-system/types/structure.js';
import { Logger, LogLevel, type LoggerConfig } from './utils/Logger.js';
import { container } from 'tsyringe';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LoxoneConnectionTools } from './tools/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  type RegisteredTool, 
  validateArguments, 
  formatMcpResponse,
  getToolsFromInstance
} from './mcp-helpers/index.js';
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
  private server: Server;
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
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'loxone-mcp-server',
        title: 'Loxone Smart Home Miniserver Connector',
        version: process.env.npm_package_version || '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: `# Loxone Smart Home MCP Server (HTTP)

This server provides tools to interact with your Loxone Miniserver for smart home control, monitoring and analyzing historical data.

- Not all controls support all commands - check control details first
- Statistics are only available for controls with statistics enabled in Loxone Config
- This is the HTTP transport version of the MCP server`,
      }
    );
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
    // Get all tools from the LoxoneConnection instance
    const registeredTools = getToolsFromInstance(this.loxone);
    
    // Handle initialize request
    this.server.setRequestHandler(InitializeRequestSchema, async (_request) => {
      return {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "loxone-mcp-server",
          version: process.env.npm_package_version || "1.0.0"
        }
      };
    });
    
    // List available tools - dynamically built from decorators
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = registeredTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      return { tools };
    });

    // Handle tool calls - unified handler that routes to decorated methods
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!request.params) {
          throw new McpError(ErrorCode.InvalidRequest, 'Missing request parameters');
        }
        const { name, arguments: args } = request.params;
        // Find the tool by name
        const tool = registeredTools.find(t => t.name === name);
        if (!tool) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        // Call the tool handler with arguments and it formats the response
        return await this.callTool(tool, args || {});
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        this.logger.error('LoxoneHttpServer', 'Tool execution failed:', error);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed because of internal error. Please try again later.`);
      }
    });
  }

  /**
   * Call a tool with the provided arguments
   */
  private async callTool(tool: RegisteredTool, args: Record<string, unknown>) {
    // Validate arguments against schema
    validateArguments(tool, args);
    // Call the method with the args object
    const result = await tool.handler(args);
    // Format response for MCP
    return formatMcpResponse(result);
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