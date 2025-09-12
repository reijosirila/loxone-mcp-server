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
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  type RegisteredTool, 
  validateArguments, 
  formatMcpResponse,
  getToolsFromInstance
} from './mcp-helpers/index.js';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'crypto';

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
  private loxone: LoxoneConnectionTools;
  private logger: Logger;
  private transport?: StreamableHTTPServerTransport;
  private app?: express.Application;
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
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Get all tools from the LoxoneConnection instance
    const registeredTools = getToolsFromInstance(this.loxone);
    
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

  /**
   * Handle MCP requests at the /mcp endpoint
   */
  private async handleMcpRequest(req: Request, res: Response): Promise<void> {
    try {
      if (!this.transport) {
        throw new Error('Transport not initialized');
      }

      await this.transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error('LoxoneHttpServer', 'MCP request handling failed:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  /**
   * Middleware to check API key authentication
   */
  private authenticateApiKey(req: Request, res: Response, next: express.NextFunction): void {
    // Skip auth if no API key is configured
    if (!this.apiKey) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    
    // Check Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === this.apiKey) {
        next();
        return;
      }
    }
    
    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader === this.apiKey) {
      next();
      return;
    }

    this.logger.warn('LoxoneHttpServer', `Unauthorized access attempt from ${req.ip}`);
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized',
      },
      id: null,
    });
  }

  public async start(): Promise<void> {
    // Connect to Loxone first
    this.logger.info('LoxoneHttpServer', 'Connecting to Loxone...');
    await this.loxone.open();
    this.logger.info('LoxoneHttpServer', 'Connected to Loxone');

    // Create Express app
    this.app = express();
    this.app.use(express.json());
    
    // Log if API key protection is enabled
    if (this.apiKey) {
      this.logger.info('LoxoneHttpServer', 'API key authentication enabled');
    } else {
      this.logger.warn('LoxoneHttpServer', 'API key authentication disabled - server is publicly accessible');
    }

    // Create HTTP transport with stateful mode (session management)
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });

    // Connect server to transport
    await this.server.connect(this.transport);

    // Setup routes with authentication
    this.app.post('/mcp', 
      this.authenticateApiKey.bind(this),
      (req, res) => {
        this.logger.info('LoxoneHttpServer', `POST /mcp from ${req.ip} - Session: ${req.headers['mcp-session-id'] || 'none'}`);
        this.handleMcpRequest(req, res).catch(error => {
          this.logger.error('LoxoneHttpServer', 'Unhandled error in POST /mcp:', error);
        });
      }
    );

    this.app.get('/mcp', 
      this.authenticateApiKey.bind(this),
      async (req, res) => {
        this.logger.info('LoxoneHttpServer', `GET /mcp from ${req.ip} - Session: ${req.headers['mcp-session-id'] || 'none'}`);
        try {
          if (!this.transport) {
            throw new Error('Transport not initialized');
          }
          // StreamableHTTPServerTransport can handle GET requests for SSE
          await this.transport.handleRequest(req, res, undefined);
        } catch (error) {
          this.logger.error('LoxoneHttpServer', 'GET /mcp handling failed:', error);
          res.status(405).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed',
            },
            id: null,
          });
        }
      }
    );

    this.app.delete('/mcp', 
      this.authenticateApiKey.bind(this),
      async (req, res) => {
        this.logger.info('LoxoneHttpServer', `DELETE /mcp from ${req.ip} - Session: ${req.headers['mcp-session-id'] || 'none'}`);
        try {
          if (!this.transport) {
            throw new Error('Transport not initialized');
          }
          // StreamableHTTPServerTransport handles DELETE for session termination
          await this.transport.handleRequest(req, res, req.body);
        } catch (error) {
          this.logger.error('LoxoneHttpServer', 'DELETE /mcp handling failed:', error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    );

    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      this.logger.info('LoxoneHttpServer', `GET /health from ${req.ip}`);
      res.json({ status: 'ok', name: 'loxone-mcp-server', version: process.env.npm_package_version || 'unknown' });
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer = this.app!.listen(this.port, () => {
        this.logger.info('LoxoneHttpServer', `MCP HTTP server listening on ::${this.port}/mcp`);
        resolve();
      });
      this.httpServer!.on('error', reject);
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