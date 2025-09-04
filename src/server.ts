import 'reflect-metadata';
import { container } from 'tsyringe';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { LoxoneConnection } from './LoxoneConnection.js';
import type { LoxoneConfig } from './loxone-system/types/structure.js';
import { StatisticsPeriod } from './loxone-system/types/structure.js';
import { Logger, LogLevel, type LoggerConfig } from './utils/Logger.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Register Logger configuration for stdio transport
const loggerConfig: LoggerConfig = {
  transport: 'stdio',
  level: LogLevel.DEBUG
};
// logger it is important to load logger first, so we dont have unexpected console.log
container.register<LoggerConfig>('LoggerConfig', { useValue: loggerConfig });
const logger = container.resolve(Logger);

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


dotenv.config({ path: join(__dirname, '..', '.env') });

// Configuration
const config: Partial<LoxoneConfig> = {
  host: process.env.LOXONE_HOST,
  username: process.env.LOXONE_USERNAME,
  password: process.env.LOXONE_PASSWORD,
  port: process.env.LOXONE_PORT ? parseInt(process.env.LOXONE_PORT) : 80,
  serialNumber: process.env.LOXONE_SERIAL_NUMBER || undefined,
};

class LoxoneStdioServer {
  private server: Server;
  private loxone: LoxoneConnection;
  private logger: Logger;

  constructor(config: Partial<LoxoneConfig>) {
    this.logger = container.resolve(Logger);
    this.loxone = new LoxoneConnection(config);
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'loxone-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'getRooms',
          description: 'Get all rooms from Smart Home',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'getCategories',
          description: 'Get all categories from  Smart Home',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
         {
          name: 'getControl',
          description: 'Get one Control. Returns control with their current state values and available commands.',
          inputSchema: {
            type: 'object',
            properties: {
              uuid: {
                type: 'string',
                description: 'Control UUID',
              },
            },
            required: [],
          },
        },
        {
          name: 'getControls',
          description: 'Get controls with optional room/category filter. Returns controls with their current state values and available commands.',
          inputSchema: {
            type: 'object',
            properties: {
              roomUuid: {
                type: 'string',
                description: 'Optional: Filter by room UUID',
              },
              categoryUuid: {
                type: 'string',
                description: 'Optional: Filter by category UUID',
              },
            },
            required: [],
          },
        },
        {
          name: 'setControl',
          description: 'Send a command to a control',
          inputSchema: {
            type: 'object',
            properties: {
              uuid: {
                type: 'string',
                description: 'Control UUID',
              },
              command: {
                type: 'string',
                description: 'Command name (e.g., "on", "off", "setValue", "setTemperature")',
              },
              value: {
                type: ['string', 'number', 'boolean'],
                description: 'Optional value for commands that require it',
              },
            },
            required: ['uuid', 'command'],
          },
        },
        {
          name: 'getStatistics',
          description: 'Get historical data for controls with statistics enabled. Returns aggregated data for easy analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              uuid: {
                type: 'string',
                description: 'Control UUID to get statistics for',
              },
              period: {
                type: 'string',
                enum: Object.values(StatisticsPeriod),
                description: 'Time period to retrieve statistics for',
              },
            },
            required: ['uuid', 'period'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!request.params) {
          throw new McpError(ErrorCode.InvalidRequest, 'Missing request parameters');
        }
        const { name, arguments: args } = request.params;
        switch (name) {
          case 'getRooms':
            return this.handleGetRooms();
          case 'getCategories':
            return this.handleGetCategories();
          case 'getControls':
            return this.handleGetControls(args as any);
          case 'getControl':
            return this.handleGetControl(args as any);
          case 'setControl':
            return this.handleSetControl(args as any);
          case 'getStatistics':
            return this.handleGetStatistics(args as any);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  private async handleGetRooms() {
    const rooms = this.loxone.getRooms();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(rooms, null, 2),
        },
      ],
    };
  }

  private async handleGetCategories() {
    const categories = this.loxone.getCategories();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(categories, null, 2),
        },
      ],
    };
  }

  private async handleGetControls(args: { roomUuid?: string; categoryUuid?: string }) {
    try {
      const controls = this.loxone.getControls(args.roomUuid, args.categoryUuid);
      // Simply use the control's toJSON method which handles all formatting
      const formattedControls = controls.map(control => control.toJSON());
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(formattedControls, null, 2),
          },
        ],
      };
    }catch(err) {
      this.logger.error('LoxoneStdioServer', 'Error getting controls:', err);
      throw err;
    }
  }

  private async handleGetControl(args: { uuid: string; }) {
    const control = this.loxone.getControl(args.uuid);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(control.toJSON(), null, 2),
        },
      ],
    };
  }

  private async handleSetControl(args: { uuid: string; command: string; value?: unknown }) {
    const success = await this.loxone.setControl(args.uuid, args.command, args.value);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success,
            message: success ? 
              `Command '${args.command}' sent to control ${args.uuid}` : 
              `Failed to send command '${args.command}' to control ${args.uuid}`
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetStatistics(args: { uuid: string; period: string }) {
    try {
      // First check if control has statistics
      const controls = this.loxone.getControls();
      const controlInstance = controls.find(c => c.getUuid() === args.uuid);
      if (!controlInstance) {
        throw new Error(`Control ${args.uuid} not found`);
      }
      if (!controlInstance.hasStatistics) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No statistics available',
                message: `Control '${controlInstance.name}' does not have statistics enabled`,
                uuid: args.uuid,
                hasStatistics: false
              }, null, 2),
            },
          ],
        };
      }

      // Get statistics data
      const statistics = await this.loxone.getStatistics(args.uuid, args.period as StatisticsPeriod);
      // Format for AI understanding
      const formatted: any = {
        control: controlInstance.name,
        uuid: args.uuid,
        type: controlInstance.getType(),
        room: controlInstance.room,
        category: controlInstance.category,
        period: args.period,
        timeRange: {
          from: statistics.from,
          to: statistics.to
        },
        statisticsType: statistics.type,
        aggregationLevel: statistics.aggregationLevel || 'auto'
      };
      
      // Add type-specific fields
      if (statistics.type === 'v1' && 'aggregatedData' in statistics) {
        formatted.aggregatedData = statistics.aggregatedData;
        formatted.summary = statistics.summary;
        formatted.totalDataPoints = statistics.totalDataPoints;
      } else if (statistics.type === 'v2' && 'summary' in statistics) {
        formatted.summary = statistics.summary;
      } else if ('error' in statistics) {
        // Fallback response
        formatted.error = statistics.error;
        formatted.info = statistics.info;
        if (statistics.frequency !== undefined) formatted.frequency = statistics.frequency;
        if (statistics.outputs !== undefined) formatted.outputs = statistics.outputs;
        if (statistics.groups !== undefined) formatted.groups = statistics.groups;
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Failed to get statistics',
              message: error instanceof Error ? error.message : 'Unknown error',
              uuid: args.uuid
            }, null, 2),
          },
        ],
      };
    }
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

// Main
(async () => {
  const server = new LoxoneStdioServer(config);
  
  // Handle graceful shutdo  wn
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
  
  try {
    await server.start();
  } catch (error) {
    logger.error('Main', 'Failed to start:', error);
    process.exit(1);
  }
})();