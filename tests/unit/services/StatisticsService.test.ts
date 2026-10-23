import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { StatisticsService } from '../../../src/tools/loxone-system/services/StatisticsService.js';
import { TimeService } from '../../../src/tools/loxone-system/services/TimeService.js';
import type { ConnectionManager } from '../../../src/tools/loxone-system/services/ConnectionManager.js';
import type { StateManager } from '../../../src/tools/loxone-system/services/StateManager.js';
import type { StructureFile } from '../../../src/tools/loxone-system/types/structure.js';
import type { V2StatisticsResponse, FallbackStatisticsResponse } from '../../../src/tools/loxone-system/types/statistics.js';
import { AggregationInterval, StatisticsPeriod } from '../../../src/tools/loxone-system/types/structure.js';
import {
  dailyDiffAcrossDstHex,
  hourlyDiffHex,
  meterStatisticV2,
  rawPowerHex,
  rejectedRequestBody
} from '../../fixtures/statistic-v2.js';

const METER = '00000000-0000-0001-ffff000000000000';
const LEGACY = '00000000-0000-0002-ffff000000000000';
const utc = (iso: string) => Date.parse(iso) / 1000;

const binary = (hex: string) => new Response(Buffer.from(hex, 'hex'), { headers: { 'content-type': 'application/octet-stream' } });

function dayRows(rows: Array<[string, number]>): string {
  const buffer = Buffer.alloc(rows.length * 12);
  rows.forEach(([iso, value], i) => {
    buffer.writeUInt32LE(utc(iso), i * 12);
    buffer.writeDoubleLE(value, i * 12 + 4);
  });
  return buffer.toString('hex');
}

describe('StatisticsService V2', () => {
  let service: StatisticsService;
  let fetchMock: jest.Mock<(path: string) => Promise<Response>>;
  let offset: string;

  beforeEach(() => {
    offset = '+03:00';
    fetchMock = jest.fn<(path: string) => Promise<Response>>();
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    jest.spyOn(container, 'resolve').mockReturnValue(logger);
    const connectionManager = { fetch: fetchMock } as unknown as ConnectionManager;
    const timeService = new TimeService({} as StateManager, connectionManager);
    jest.spyOn(timeService, 'getControllerTimeOffset').mockImplementation(() => offset);
    service = new StatisticsService(connectionManager, timeService);
    service.updateStructure({
      controls: {
        [METER]: { name: 'Grid', type: 'Meter', statisticV2: meterStatisticV2 },
        [LEGACY]: { name: 'Water Meter', type: 'Meter', statistic: { frequency: 1, outputs: [{ id: 0, name: 'Usage' }] } },
      },
    } as unknown as StructureFile);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function serve(responses: { raw?: () => Response; diff?: () => Response }) {
    fetchMock.mockImplementation(async (path: string) => {
      const kind = path.split('/')[4] as 'raw' | 'diff';
      const respond = responses[kind];
      if (!respond) throw new Error(`unexpected request ${path}`);
      return respond();
    });
  }

  it('returns hourly power with per-hour consumption from the meter counter', async () => {
    serve({ raw: () => binary(rawPowerHex), diff: () => binary(hourlyDiffHex) });

    const result = await service.getStatistics(METER, StatisticsPeriod.Last24Hours, '2026-10-19T20:30:00', '2026-10-20T03:00:00') as V2StatisticsResponse;

    const from = utc('2026-10-19T20:00:00+03:00');
    const to = utc('2026-10-20T03:00:00+03:00');
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      `jdev/sps/getStatistic/${METER}/diff/${from}/${to}/hour/2/total`,
      `jdev/sps/getStatistic/${METER}/raw/${from}/${to}/all/1/actual`,
    ]);
    expect(result).toMatchObject({
      type: 'v2',
      aggregationLevel: AggregationInterval.Hour,
      from: '2026-10-19T20:00:00+03:00',
      to: '2026-10-20T03:00:00+03:00',
      totalDataPoints: 7,
      selectedOutput: { index: 1, title: 'Power', output: 'actual', unit: 'kW', accumulated: false },
      consumption: { output: 'total', unit: 'kWh', from: '2026-10-19T20:00:00+03:00', total: 0.244 },
    });
    expect(result.aggregatedData).toEqual([
      { timestamp: '2026-10-20T00:00:00+03:00', average: 0.06, min: 0.06, max: 0.06, count: 2, consumption: 0.062 },
      { timestamp: '2026-10-20T01:00:00+03:00', average: 0.07, min: 0.07, max: 0.07, count: 2, consumption: 0.067 },
      { timestamp: '2026-10-20T02:00:00+03:00', average: 0.09, min: 0.07, max: 0.11, count: 2, consumption: 0.115 },
      { timestamp: '2026-10-20T03:00:00+03:00', average: 0.12, min: 0.12, max: 0.12, count: 1 },
    ]);
    expect(result.valueDescription).toContain('Power');
    expect(result.valueDescription).toContain('kW');
    expect(result.valueDescription).toContain('kWh');
    expect(result.outputs.map(o => o.title)).toEqual(['Power', 'Meter Reading']);
  });

  it('returns consumption as the values when the counter output is selected', async () => {
    serve({ diff: () => binary(hourlyDiffHex) });
    service.setOutputColumn(2);

    const result = await service.getStatistics(METER, StatisticsPeriod.Last24Hours, '2026-10-19T20:00:00', '2026-10-20T03:00:00') as V2StatisticsResponse;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.selectedOutput.output).toBe('total');
    expect(result.aggregatedData.map(r => [r.timestamp, r.average, r.consumption])).toEqual([
      ['2026-10-20T00:00:00+03:00', 0.062, 0.062],
      ['2026-10-20T01:00:00+03:00', 0.067, 0.067],
      ['2026-10-20T02:00:00+03:00', 0.115, 0.115],
    ]);
    expect(result.valueDescription).toContain('difference of the counter');
  });

  it('labels Loxone day buckets by calendar day across a DST change', async () => {
    offset = '+02:00';
    serve({ diff: () => binary(dailyDiffAcrossDstHex) });
    service.setOutputColumn(2);

    const result = await service.getStatistics(METER, StatisticsPeriod.LastWeek, '2026-03-27T00:00:00', '2026-03-31T23:59:59') as V2StatisticsResponse;

    expect(fetchMock.mock.calls[0][0]).toContain(`/diff/${utc('2026-03-27T00:00:00+02:00')}/`);
    expect(fetchMock.mock.calls[0][0]).toContain('/day/2/total');
    expect(result.aggregatedData.map(r => [r.timestamp, r.consumption])).toEqual([
      ['2026-03-27T00:00:00+02:00', 3.698],
      ['2026-03-28T00:00:00+02:00', 4.334],
      ['2026-03-29T00:00:00+02:00', 4.091],
      ['2026-03-30T00:00:00+02:00', 4.016],
      ['2026-03-31T00:00:00+02:00', 4.066],
    ]);
  });

  it('sums daily diffs into calendar months', async () => {
    serve({
      diff: () => binary(dayRows([
        ['2026-01-31T00:00:00+03:00', 1],
        ['2026-02-01T00:00:00+03:00', 2],
        ['2026-02-28T00:00:00+03:00', 3],
        ['2026-03-01T00:00:00+03:00', 4],
      ])),
    });
    service.setOutputColumn(2);

    const result = await service.getStatistics(METER, StatisticsPeriod.LastYear, '2026-01-15T00:00:00', '2026-05-01T00:00:00') as V2StatisticsResponse;

    expect(fetchMock.mock.calls[0][0]).toContain(`/diff/${utc('2026-01-01T00:00:00+03:00')}/`);
    expect(fetchMock.mock.calls[0][0]).toContain('/day/2/total');
    expect(result.aggregationLevel).toBe(AggregationInterval.Month);
    expect(result.aggregatedData.map(r => [r.timestamp, r.consumption])).toEqual([
      ['2026-01-01T00:00:00+03:00', 1],
      ['2026-02-01T00:00:00+03:00', 5],
      ['2026-03-01T00:00:00+03:00', 4],
    ]);
    expect(result.consumption?.total).toBe(10);
  });

  it('lists each power sample for minute-level ranges and totals consumption from the hour', async () => {
    serve({ raw: () => binary(rawPowerHex), diff: () => binary(hourlyDiffHex) });

    const result = await service.getStatistics(METER, StatisticsPeriod.LastHour, '2026-10-20T00:10:00', '2026-10-20T01:10:00') as V2StatisticsResponse;

    expect(fetchMock.mock.calls[0][0]).toContain(`/diff/${utc('2026-10-20T00:00:00+03:00')}/`);
    expect(fetchMock.mock.calls[0][0]).toContain('/hour/2/total');
    expect(result.aggregationLevel).toBe(AggregationInterval.Minute);
    expect(result.aggregatedData.map(r => r.timestamp)).toEqual([
      '2026-10-20T00:30:00+03:00',
      '2026-10-20T01:00:00+03:00',
    ]);
    expect(result.aggregatedData.every(r => r.consumption === undefined)).toBe(true);
    expect(result.consumption?.from).toBe('2026-10-20T00:00:00+03:00');
  });

  it('rejects an output the control does not have, listing the available ones', async () => {
    service.setOutputColumn(3);

    await expect(service.getStatistics(METER, StatisticsPeriod.LastWeek))
      .rejects.toThrow('Available outputs: 1=Power (kW), 2=Meter Reading (kWh)');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to metadata when the Miniserver rejects the request', async () => {
    serve({
      diff: () => new Response(rejectedRequestBody, { headers: { 'content-type': 'application/json' } }),
      raw: () => binary(rawPowerHex),
    });

    const result = await service.getStatistics(METER, StatisticsPeriod.Last24Hours) as FallbackStatisticsResponse;

    expect(result.type).toBe('v2');
    expect(result.error).toBe('Could not fetch actual data');
    expect(result.groups).toEqual(meterStatisticV2.groups);
  });

  it('keeps V1 controls on the statistics.json path', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ Statisticfiles: { File: [] } })));

    const result = await service.getStatistics(LEGACY, StatisticsPeriod.Last24Hours);

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['stats/statistics.json']);
    expect(result.type).toBe('v1');
  });
});
