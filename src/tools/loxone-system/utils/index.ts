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
const LOXONE_EPOCH_OFFSET_SECONDS = 1230768000; // 2009-01-01T00:00:00 in Miniserver local time

/**
 * Formats a Loxone timestamp (seconds since 2009-01-01, Miniserver local time) as
 * "YYYY-MM-DD HH:mm:ss" in Miniserver local time. Returns undefined for 0/invalid.
 */
export function formatLoxoneTimestamp(value: unknown): string | undefined {
  const seconds = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const date = new Date((seconds + LOXONE_EPOCH_OFFSET_SECONDS) * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Formats a duration in seconds as e.g. "1h 05m 30s". */
export function formatDuration(value: unknown): string {
  const total = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(total) || total < 0) return String(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function toBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '0' && value.toLowerCase() !== 'false' && value !== '';
  return Boolean(value);
}
