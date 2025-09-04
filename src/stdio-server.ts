import 'reflect-metadata';
import type { LoxoneConfig } from './tools/loxone-system/types/structure.js';
import { Logger, LogLevel, type LoggerConfig } from './utils/Logger.js';
import { container } from 'tsyringe';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

// Register Logger configuration for stdio transport
const loggerConfig: LoggerConfig = {
  transport: 'stdio',
  level: LogLevel.DEBUG
};
// logger it is important to load logger first, so we don't have unexpected console.log
container.register<LoggerConfig>('LoggerConfig', { useValue: loggerConfig });
container.resolve(Logger);

export class LoxoneStdioServer {
  private server: Server;
  private loxone: LoxoneConnectionTools;
  private logger: Logger;

  constructor(config: Partial<LoxoneConfig>) {
    this.logger = container.resolve(Logger);
    this.loxone = new LoxoneConnectionTools(config);
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
        instructions: `# Loxone Smart Home MCP Server

This server provides tools to interact with your Loxone Miniserver for smart home control, monitoring and analyzing historical data.

- Not all controls support all commands - check control details first
- Statistics are only available for controls with statistics enabled in Loxone Config`,
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
        this.logger.error('LoxoneServer', 'Tool execution failed:', error);
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

  public async start(): Promise<void> {
    // Connect to Loxone first
    this.logger.info('LoxoneServer', 'Connecting to Loxone...');
    await this.loxone.open();
    this.logger.info('LoxoneServer', 'Connected to Loxone');
    // Create stdio transport
    const transport = new StdioServerTransport();
    // Connect server to transport
    await this.server.connect(transport);
    this.logger.info('LoxoneServer', 'MCP server started on stdio');
  }

  public async stop(): Promise<void> {
    this.logger.info('LoxoneServer', 'Shutting down...');
    await Promise.all([
      this.loxone.close(),
      this.server.close()
    ]);
    this.logger.info('LoxoneServer', 'Shutdown complete');
  }
}
