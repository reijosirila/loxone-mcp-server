import { describe, it, expect } from '@jest/globals';
import {
  alignToBucketStart,
  assignToBuckets,
  generateBucketStarts,
  listStatisticV2Outputs,
  nextBucketStart,
  parseStatisticV2Binary,
  unitFromFormat
} from '../../../src/tools/loxone-system/services/StatisticV2.js';
import { AggregationInterval } from '../../../src/tools/loxone-system/types/structure.js';
import {
  energyFlowMonitorStatisticV2,
  meterStatisticV2,
  rawPowerHex
} from '../../fixtures/statistic-v2.js';

const TALLINN_SUMMER = 3 * 3600;
const utc = (iso: string) => Date.parse(iso) / 1000;

describe('parseStatisticV2Binary', () => {
  it('decodes little-endian uint32 timestamps and float64 values from a real response', () => {
    const rows = parseStatisticV2Binary(Buffer.from(rawPowerHex, 'hex'));
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ timestamp: utc('2026-10-20T00:00:00+03:00'), values: [0.06] });
    expect(rows[1].timestamp - rows[0].timestamp).toBe(1800);
    expect(rows[6]).toEqual({ timestamp: utc('2026-10-20T03:00:00+03:00'), values: [0.12] });
  });

  it('decodes several values per record in request order', () => {
    const record = Buffer.alloc(20);
    record.writeUInt32LE(1792443600, 0);
    record.writeDoubleLE(1.5, 4);
    record.writeDoubleLE(-2.25, 12);
    expect(parseStatisticV2Binary(record, 2)).toEqual([{ timestamp: 1792443600, values: [1.5, -2.25] }]);
  });

  it('respects the byte offset of a view into a larger buffer', () => {
    const backing = Buffer.concat([Buffer.alloc(3), Buffer.from(rawPowerHex, 'hex').subarray(0, 12)]);
    expect(parseStatisticV2Binary(backing.subarray(3))).toEqual([{ timestamp: utc('2026-10-20T00:00:00+03:00'), values: [0.06] }]);
  });

  it('returns no rows for an empty response', () => {
    expect(parseStatisticV2Binary(new Uint8Array(0))).toEqual([]);
  });

  it('rejects a payload that is not a whole number of records', () => {
    expect(() => parseStatisticV2Binary(new Uint8Array(13))).toThrow('not a multiple of the 12-byte record size');
  });
});

describe('unitFromFormat', () => {
  it.each([
    ['0,000kW', 'kW'],
    ['0,0kWh', 'kWh'],
    ['0,00€', '€'],
    ['%.3fkW', 'kW'],
    ['%.3 kW', 'kW'],
    ['%.1f°', '°'],
    [undefined, ''],
  ])('%s -> %s', (format, unit) => {
    expect(unitFromFormat(format)).toBe(unit);
  });
});

describe('listStatisticV2Outputs', () => {
  it('flattens meter groups into 1-based outputs with units and accumulation', () => {
    expect(listStatisticV2Outputs(meterStatisticV2)).toEqual([
      { index: 1, groupId: '1', title: 'Power', output: 'actual', unit: 'kW', accumulated: false, sampling: 'every 30 minutes' },
      { index: 2, groupId: '2', title: 'Meter Reading', output: 'total', unit: 'kWh', accumulated: true, sampling: 'every 60 minutes' },
    ]);
  });

  it('skips groups without data points', () => {
    const outputs = listStatisticV2Outputs(energyFlowMonitorStatisticV2);
    expect(outputs.map(o => [o.index, o.groupId, o.output])).toEqual([[1, '1', 'totalSelfConsumption'], [2, '2', 'OYt']]);
  });

  it('returns nothing without statisticV2', () => {
    expect(listStatisticV2Outputs(undefined)).toEqual([]);
  });
});

describe('bucket boundaries', () => {
  it('aligns to local hour, day and month starts', () => {
    const ts = utc('2026-10-23T15:21:18+03:00');
    expect(alignToBucketStart(ts, AggregationInterval.Hour, TALLINN_SUMMER)).toBe(utc('2026-10-23T15:00:00+03:00'));
    expect(alignToBucketStart(ts, AggregationInterval.Day, TALLINN_SUMMER)).toBe(utc('2026-10-23T00:00:00+03:00'));
    expect(alignToBucketStart(ts, AggregationInterval.Month, TALLINN_SUMMER)).toBe(utc('2026-10-01T00:00:00+03:00'));
  });

  it('aligns a UTC evening to the next local day', () => {
    expect(alignToBucketStart(utc('2026-10-22T22:30:00Z'), AggregationInterval.Day, TALLINN_SUMMER)).toBe(utc('2026-10-23T00:00:00+03:00'));
  });

  it('steps calendar months across a year boundary', () => {
    expect(generateBucketStarts(utc('2025-11-15T10:00:00+03:00'), utc('2026-02-01T00:00:00+03:00'), AggregationInterval.Month, TALLINN_SUMMER)).toEqual([
      utc('2025-11-01T00:00:00+03:00'),
      utc('2025-12-01T00:00:00+03:00'),
      utc('2026-01-01T00:00:00+03:00'),
      utc('2026-02-01T00:00:00+03:00'),
    ]);
    expect(nextBucketStart(utc('2026-01-01T00:00:00+03:00'), AggregationInterval.Month, TALLINN_SUMMER)).toBe(utc('2026-02-01T00:00:00+03:00'));
  });

  it('assigns samples to half-open buckets and keeps the last bucket open through the end', () => {
    const buckets = assignToBuckets(
      [
        { timestamp: 99, value: 0 },
        { timestamp: 100, value: 1 },
        { timestamp: 199, value: 2 },
        { timestamp: 200, value: 3 },
        { timestamp: 250, value: 4 },
        { timestamp: 251, value: 5 },
      ],
      [100, 200],
      250
    );
    expect(buckets).toEqual([{ start: 100, values: [1, 2] }, { start: 200, values: [3, 4] }]);
  });
});
