import 'reflect-metadata';
import type { LoxoneConfig } from './tools/loxone-system/types/structure.js';
import { Logger, LogLevel, type LoggerConfig } from './utils/Logger.js';
import { container } from 'tsyringe';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LoxoneConnectionTools } from './tools/index.js';
import { registerTools, SERVER_INFO, SERVER_INSTRUCTIONS } from './mcp-helpers/index.js';

// Register Logger configuration for stdio transport
const loggerConfig: LoggerConfig = {
  transport: 'stdio',
  level: Number(process.env.LOG_LEVEL || LogLevel.WARN)
};
// logger it is important to load logger first, so we don't have unexpected console.log
container.register<LoggerConfig>('LoggerConfig', { useValue: loggerConfig });
container.resolve(Logger);

export class LoxoneStdioServer {
  private server: McpServer;
  private loxone: LoxoneConnectionTools;
  private logger: Logger;

  constructor(config: Partial<LoxoneConfig>) {
    this.logger = container.resolve(Logger);
    this.loxone = new LoxoneConnectionTools(config);
    this.server = new McpServer(SERVER_INFO, {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
    });
    registerTools(this.server, this.loxone, this.logger, 'LoxoneServer');
  }

  public async start(): Promise<void> {
    this.logger.info('LoxoneServer', 'Connecting to Loxone...');
    await this.loxone.open();
    this.logger.info('LoxoneServer', 'Connected to Loxone');
    const transport = new StdioServerTransport();
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
