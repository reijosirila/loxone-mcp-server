import type { BinaryEvent } from '../types/api-responses.js';
import { sprintf } from 'sprintf-js';

/**
 * Convert a Loxone binary UUID buffer to string format
 */
export function bufferToUuid(buffer: BinaryEvent['uuid'] | undefined): string | null {
  if (!buffer || !buffer.data1) return null;
  const d1 = buffer.data1.toString('hex');
  const d2 = buffer.data2.toString('hex');
  const d3 = buffer.data3.toString('hex');
  const d4 = buffer.data4.toString('hex');
  return `${d1}-${d2}-${d3}-${d4}`;
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Get the value type for a control state
 */
export function getValueType(value: unknown, defaultType: 'number' | 'boolean' | 'string' | 'object' = 'string'): 'number' | 'boolean' | 'string' | 'object' {
  const type = typeof value;
  if (type === 'number' || type === 'boolean' || type === 'string' || type === 'object') {
    return type;
  }
  return defaultType;
}

/**
 * Format a value using Loxone's format string
 * Loxone uses printf-style format strings like "%.1f%%" or "<v>°C"
 * @param format The format string from control.details.format
 * @param value The numeric value to format
 * @returns The formatted string
 */
export function formatLoxoneValue(format: string | undefined, value: unknown): string {
  if (!format || value === null || value === undefined) {
    return value != null ? String(value) : '';
  }

  // If format contains <v>, use simple replacement
  if (format.includes('<v>')) {
    return format.replace('<v>', String(value));
  }

  // Otherwise, try to use sprintf for printf-style formatting
  try {
    // Loxone often uses %.Xf format (where X is decimal places)
    // Common patterns: "%.1f°C", "%.0f%%", "%.2fkWh"
    return sprintf(format, value);
  } catch {
    // If sprintf fails, just append the format as a unit
    return `${value}${format}`;
  }
}

/**
 * Extract the unit from a Loxone format string
 * @param format The format string from control.details.format
 * @returns The extracted unit or undefined
 */
export function extractUnit(format: string | undefined): string | undefined {
  if (!format) return undefined;
  // If format contains <v>, extract everything except <v>
  if (format.includes('<v>')) {
    return format.replace('<v>', '').trim() || undefined;
  }
  // For printf-style formats, extract the suffix after the format specifier
  // Examples: "%.1f°C" -> "°C", "%.0f%%" -> "%", "%.2fkWh" -> "kWh"
  const match = format.match(/%[-+0-9.]*[diouxXeEfFgGaAcspn%](.*)/);
  if (match && match[1]) {
    // Handle %% which means literal %
    if (format.includes('%%')) {
      const suffix = match[1].replace('%%', '%').replace('%', '');
      return suffix || '%';
    }
    return match[1].trim() || undefined;
  }
  return undefined;
}