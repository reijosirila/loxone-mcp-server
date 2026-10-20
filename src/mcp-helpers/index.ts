import 'reflect-metadata';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { Logger } from '../utils/Logger.js';

export interface ToolMetadata {
  /** Defaults to the method name */
  name?: string;
  title?: string;
  description: string;
  /** zod raw shape; the SDK validates arguments before the method is called */
  inputSchema?: ZodRawShape;
  annotations?: ToolAnnotations;
}

export interface RegisteredTool extends ToolMetadata {
  name: string;
  methodName: string;
  handler: (args: Record<string, unknown>) => unknown;
}

/** Marks a method as an MCP tool; collect them with getToolsFromInstance(). */
export function Tool(metadata: ToolMetadata): MethodDecorator {
  return function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const toolName = metadata.name || String(propertyKey);
    Reflect.defineMetadata('tool:metadata', metadata, target, propertyKey);
    Reflect.defineMetadata('tool:name', toolName, target, propertyKey);
    const existingTools = Reflect.getMetadata('tools', target) || [];
    existingTools.push(propertyKey);
    Reflect.defineMetadata('tools', existingTools, target);
    return descriptor;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolsFromInstance(instance: any): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  const prototype = Object.getPrototypeOf(instance);
  const toolMethods: (string | symbol)[] = Reflect.getMetadata('tools', prototype) || [];
  for (const methodName of toolMethods) {
    const metadata: ToolMetadata | undefined = Reflect.getMetadata('tool:metadata', prototype, methodName);
    const toolName: string | undefined = Reflect.getMetadata('tool:name', prototype, methodName);
    if (metadata && toolName) {
      tools.push({
        ...metadata,
        name: toolName,
        methodName: String(methodName),
        handler: instance[methodName].bind(instance)
      });
    }
  }
  return tools;
}

export function formatMcpResponse(result: unknown) {
  let data = result;
  if (Array.isArray(result)) {
    data = result.map(item => item && typeof item.toJSON === 'function' ? item.toJSON() : item);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if (result && typeof (result as any).toJSON === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data = (result as any).toJSON();
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Failures are reported inside the result (isError) so the model can read the
 * reason and correct itself instead of receiving an opaque protocol error.
 */
export function formatMcpToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/** Registers every @Tool method of the instance on the MCP server. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTools(server: McpServer, instance: any, logger: Logger, component: string): RegisteredTool[] {
  const tools = getToolsFromInstance(instance);
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema ?? {},
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        try {
          return formatMcpResponse(await tool.handler(args ?? {}));
        } catch (error) {
          logger.warn(component, `Tool ${tool.name} failed:`, error instanceof Error ? error.message : error);
          return formatMcpToolError(error);
        }
      }
    );
  }
  return tools;
}

export const SERVER_INFO = {
  name: 'loxone-mcp-server',
  title: 'Loxone Smart Home Miniserver Connector',
  version: process.env.npm_package_version || '1.0.0',
};

export const SERVER_INSTRUCTIONS = `# Loxone Smart Home MCP Server

Tools for reading and controlling a Loxone Miniserver (lights, blinds, heating, audio, energy, sensors) and analysing its statistics.

Recommended workflow:
1. getSystemInfo to learn about the home (name, location, operating mode, control counts).
2. getRooms / getCategories, then getControls with a room, category, type or search filter. Room and category accept names, not only UUIDs.
3. getControls returns a compact list (uuid, type, summary, command names). Call getControl for full state details and command parameters.
4. setControl with the control UUID and a command name from availableCommands. The response includes the refreshed state: verify it instead of assuming success.
5. getStatistics only works for controls with hasStatistics=true.

Notes:
- Read-only controls (sensors, meters, monitors) have no commands.
- Values use the Miniserver's units; temperatures use the configured temperature unit.
- If the Miniserver is temporarily unreachable, tools report an error and the server reconnects automatically.
- Call reloadStructure after controls were added or renamed in Loxone Config.`;
