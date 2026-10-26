import { AggregationInterval } from '../types/structure.js';
import type { ControlStatisticV2 } from '../types/control-structure.js';

export interface StatisticV2Output {
  index: number;
  groupId: string;
  title: string;
  output: string;
  unit: string;
  accumulated: boolean;
  sampling: string;
}

export interface StatisticV2Row {
  timestamp: number;
  values: number[];
}

export interface StatisticV2Bucket {
  start: number;
  values: number[];
}

// Recording modes from the Loxone "Structure File" document, section StatisticV2.
const SAMPLING_BY_MODE: Record<number, string> = {
  1: 'on every change, at most once per minute',
  7: 'on every change',
  8: 'every 5 minutes',
  9: 'every 10 minutes',
  10: 'every 30 minutes',
  11: 'every 60 minutes',
  12: 'every 15 minutes',
};

export function unitFromFormat(format: string | undefined): string {
  if (!format) return '';
  return format
    .replace(/^\s*(?:%[-+ #0]*\d*(?:\.\d+)?[a-zA-Z]?|[\d.,]+)/, '')
    .trim();
}

/** Flattens the statisticV2 groups into 1-based outputs, in the order the structure file lists them. */
export function listStatisticV2Outputs(statisticV2: ControlStatisticV2 | undefined): StatisticV2Output[] {
  const outputs: StatisticV2Output[] = [];
  for (const group of statisticV2?.groups ?? []) {
    for (const dataPoint of group.dataPoints ?? []) {
      outputs.push({
        index: outputs.length + 1,
        groupId: String(group.id),
        title: dataPoint.title,
        output: dataPoint.output,
        unit: unitFromFormat(dataPoint.format),
        accumulated: group.accumulated === true,
        sampling: SAMPLING_BY_MODE[group.mode ?? -1] ?? `recording mode ${group.mode}`,
      });
    }
  }
  return outputs;
}

/**
 * Decodes a jdev/sps/getStatistic response: consecutive records of a little-endian
 * Uint32 unix UTC timestamp followed by one little-endian Float64 per requested output
 * (Loxone "Structure File", StatisticV2 > Binary Result; byte order confirmed on a live Miniserver).
 */
export function parseStatisticV2Binary(data: Uint8Array, valueCount = 1): StatisticV2Row[] {
  const recordSize = 4 + 8 * valueCount;
  if (data.byteLength % recordSize !== 0) {
    throw new Error(`StatisticV2 payload of ${data.byteLength} bytes is not a multiple of the ${recordSize}-byte record size`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rows: StatisticV2Row[] = [];
  for (let offset = 0; offset < data.byteLength; offset += recordSize) {
    const values: number[] = [];
    for (let i = 0; i < valueCount; i++) {
      values.push(view.getFloat64(offset + 4 + 8 * i, true));
    }
    rows.push({ timestamp: view.getUint32(offset, true), values });
  }
  return rows;
}

export function alignToBucketStart(timestamp: number, interval: AggregationInterval, offsetSeconds: number): number {
  const local = timestamp + offsetSeconds;
  switch (interval) {
    case AggregationInterval.Minute:
      return Math.floor(local / 60) * 60 - offsetSeconds;
    case AggregationInterval.Hour:
      return Math.floor(local / 3600) * 3600 - offsetSeconds;
    case AggregationInterval.Day:
      return Math.floor(local / 86400) * 86400 - offsetSeconds;
    case AggregationInterval.Month: {
      const date = new Date(local * 1000);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000 - offsetSeconds;
    }
  }
}

export function nextBucketStart(start: number, interval: AggregationInterval, offsetSeconds: number): number {
  switch (interval) {
    case AggregationInterval.Minute:
      return start + 60;
    case AggregationInterval.Hour:
      return start + 3600;
    case AggregationInterval.Day:
      return start + 86400;
    case AggregationInterval.Month: {
      const date = new Date((start + offsetSeconds) * 1000);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000 - offsetSeconds;
    }
  }
}

/** Bucket starts covering [from, to] in fixed-offset controller time. */
export function generateBucketStarts(from: number, to: number, interval: AggregationInterval, offsetSeconds: number): number[] {
  const starts: number[] = [];
  for (let start = alignToBucketStart(from, interval, offsetSeconds); start <= to; start = nextBucketStart(start, interval, offsetSeconds)) {
    starts.push(start);
  }
  return starts;
}

/** Each bucket spans [starts[i], starts[i + 1]); the last one runs through `to`. Samples outside are dropped. */
export function assignToBuckets(samples: ReadonlyArray<{ timestamp: number; value: number }>, starts: readonly number[], to: number): StatisticV2Bucket[] {
  const buckets: StatisticV2Bucket[] = starts.map(start => ({ start, values: [] }));
  for (const sample of samples) {
    if (sample.timestamp > to) continue;
    let low = 0;
    let high = starts.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (starts[mid] <= sample.timestamp) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (found >= 0) buckets[found].values.push(sample.value);
  }
  return buckets;
}
