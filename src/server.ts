import { LoxoneConfig } from './tools/loxone-system/types/structure.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { LoxoneHttpServer as LoxoneHttpServerType } from './http-server.js';
import type { LoxoneStdioServer as LoxoneStdioServerType } from './stdio-server.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Use quiet mode to suppress dotenv output to stdout
dotenv.config({ 
  path: join(__dirname, '..', '.env'),
  quiet: true 
});

// Configuration
const config: Partial<LoxoneConfig> = {
  host: process.env.LOXONE_HOST,
  username: process.env.LOXONE_USERNAME,
  password: process.env.LOXONE_PASSWORD,
  port: process.env.LOXONE_PORT ? parseInt(process.env.LOXONE_PORT) : 80,
  serialNumber: process.env.LOXONE_SERIAL_NUMBER || undefined,
};

// Main
(async () => {
  // Check transport type from environment or command line args
  const transport = process.env.MCP_TRANSPORT || process.argv[2] || 'stdio';
  
  let server: LoxoneHttpServerType | LoxoneStdioServerType | null = null;
  
  switch (transport.toLowerCase()) {
    case 'http':
    case 'streamablehttp':
      const { LoxoneHttpServer } = await import('./http-server.js');
      server = new LoxoneHttpServer(config);
      break;
    
    case 'stdio':
    default:
      const { LoxoneStdioServer } = await import('./stdio-server.js');
      server = new LoxoneStdioServer(config);
      break;
  }
  
  // Handle graceful shutdown
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
    console.error('Main', 'Failed to start:', error);
    process.exit(1);
  }
})();