/**
 * MCP Helper Functions and Decorators
 * Shared utilities for MCP tool implementation
 */

import 'reflect-metadata';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// JSON Schema primitive types
type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

// Property schema definition
export interface PropertySchema {
  type?: JSONSchemaType | JSONSchemaType[];
  description?: string;
  enum?: unknown[];
  items?: PropertySchema; // For array types
  properties?: Record<string, PropertySchema>; // For nested objects
  required?: string[]; // For nested objects
}

export interface ToolMetadata {
  name?: string; // Optional, will use method name if not provided
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, PropertySchema>;
    required?: string[];
  };
}

export interface RegisteredTool extends ToolMetadata {
  name: string;
  target: unknown;
  methodName: string;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  handler: Function;
}

// Global registry for all decorated tools
export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, RegisteredTool> = new Map();

  private constructor() {}

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public registerTool(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  public clear(): void {
    this.tools.clear();
  }
}

/**
 * Decorator factory for MCP tools
 * @param metadata Tool metadata including description and input schema
 */
export function tool(metadata: ToolMetadata): MethodDecorator {
  return function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const methodName = String(propertyKey);
    const toolName = metadata.name || methodName;

    // Store metadata for later retrieval
    Reflect.defineMetadata('tool:metadata', metadata, target, propertyKey);
    Reflect.defineMetadata('tool:name', toolName, target, propertyKey);

    // Mark this method as a tool
    const existingTools = Reflect.getMetadata('tools', target) || [];
    existingTools.push(propertyKey);
    Reflect.defineMetadata('tools', existingTools, target);

    // We'll register when the class is instantiated
    const originalConstructor = target.constructor;
    if (!Reflect.hasMetadata('tool:patched', originalConstructor)) {
      const patchedConstructor = class extends originalConstructor {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
          super(...args);
          // Register all tools from this instance
          const registry = ToolRegistry.getInstance();
          const tools = Reflect.getMetadata('tools', target) || [];
          for (const toolMethod of tools) {
            const toolMetadata = Reflect.getMetadata('tool:metadata', target, toolMethod);
            const toolName = Reflect.getMetadata('tool:name', target, toolMethod);
            if (toolMetadata && toolName) {
              registry.registerTool({
                ...toolMetadata,
                name: toolName,
                target: this,
                methodName: String(toolMethod),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                handler: (this as any)[toolMethod].bind(this)
              });
            }
          }
        }
      };
      Reflect.defineMetadata('tool:patched', true, patchedConstructor);
    }

    return descriptor;
  };
}

/**
 * Helper function to get all tools from a class instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolsFromInstance(instance: any): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  const prototype = Object.getPrototypeOf(instance);
  const toolMethods = Reflect.getMetadata('tools', prototype) || [];

  for (const methodName of toolMethods) {
    const metadata = Reflect.getMetadata('tool:metadata', prototype, methodName);
    const toolName = Reflect.getMetadata('tool:name', prototype, methodName);
    if (metadata && toolName) {
      tools.push({
        ...metadata,
        name: toolName,
        target: instance,
        methodName: String(methodName),
        handler: instance[methodName].bind(instance)
      });
    }
  }

  return tools;
}

/**
 * Validate arguments against tool's input schema
 * Throws McpError with InvalidRequest code if validation fails
 */
export function validateArguments(tool: RegisteredTool, args: Record<string, unknown>): void {
  const schema = tool.inputSchema;
  const required = schema.required || [];
  const properties = schema.properties || {};
  
  // Check all required parameters are present and not empty
  for (const param of required) {
    if (!(param in args)) {
      throw new McpError(
        ErrorCode.InvalidParams, 
        `Missing required parameter: ${param} for tool ${tool.name}`
      );
    }
    
    const value = args[param];
    // Check for empty/null/undefined values
    if (value === null || value === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Required parameter ${param} cannot be null or undefined for tool ${tool.name}`
      );
    }
    
    // Check for empty strings
    if (typeof value === 'string' && value.trim() === '') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Required parameter ${param} cannot be an empty string for tool ${tool.name}`
      );
    }
    
    // Check for empty arrays
    if (Array.isArray(value) && value.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Required parameter ${param} cannot be an empty array for tool ${tool.name}`
      );
    }
  }
  
  // Validate parameter types
  for (const [key, value] of Object.entries(args)) {
    if (!(key in properties)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown parameter: ${key} for tool ${tool.name}`
      );
    }
    
    const propSchema = properties[key];
    const expectedType = propSchema.type;
    
    // Map JavaScript typeof to JSON Schema types
    const getJsonSchemaType = (val: unknown): JSONSchemaType | 'undefined' => {
      if (val === null) return 'null';
      if (val === undefined) return 'undefined';
      const jsType = typeof val;
      if (jsType === 'object') {
        return Array.isArray(val) ? 'array' : 'object';
      }
      if (jsType === 'number') return 'number';
      if (jsType === 'string') return 'string';
      if (jsType === 'boolean') return 'boolean';
      return 'undefined';
    };
    
    const schemaType = getJsonSchemaType(value);
    
    // Skip type validation for optional parameters that are null/undefined
    const isRequired = required.includes(key);
    if (!isRequired && (value === null || value === undefined)) {
      continue; // Skip validation for optional null/undefined values
    }
    
    // Handle array of types (e.g., ['string', 'number', 'boolean'])
    if (Array.isArray(expectedType)) {
      if (!expectedType.includes(schemaType as JSONSchemaType)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid type for parameter ${key}: expected one of [${expectedType.join(', ')}], got ${schemaType}`
        );
      }
    } else if (expectedType && schemaType !== expectedType) {
      // Single type validation
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid type for parameter ${key}: expected ${expectedType}, got ${schemaType}`
      );
    }
    
    // Validate enum values if specified
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid value for parameter ${key}: must be one of [${propSchema.enum.join(', ')}]`
      );
    }
  }
}


/**
 * Format any result as MCP response
 */
export function formatMcpResponse(result: unknown) {
  // Handle special cases for controls with toJSON method
  let data = result;
  
  if (Array.isArray(result)) {
    // If array of controls, check if they have toJSON
    data = result.map(item => 
      item && typeof item.toJSON === 'function' ? item.toJSON() : item
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if (result && Object.prototype.hasOwnProperty.call(result, 'toJSON') && typeof (result as any).toJSON === 'function') {
    // Single control with toJSON
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data = (result as any).toJSON();
  }
  // Wrap in MCP response format
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}