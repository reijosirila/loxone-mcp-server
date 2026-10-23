import dayjs from 'dayjs';
import { injectable, container } from 'tsyringe';
import { StatisticsPeriod, AggregationInterval, type StructureFile } from '../types/structure.js';
import type {
  StatisticsResponse,
  StatisticsDataPoint,
  AggregatedDataPoint,
  StatisticsSummary,
  StatisticsAvailableDate,
  StatisticsMetadata,
  V1StatisticsResponse,
  V2StatisticsResponse,
  V2AggregatedDataPoint,
  V2OutputInfo,
  FallbackStatisticsResponse
} from '../types/statistics.js';
import type { ControlStatisticV2 } from '../types/control-structure.js';
import { TimeService } from './TimeService.js';
import { Logger } from '../../../utils/Logger.js';
import { ConnectionManager } from './ConnectionManager.js';
import {
  alignToBucketStart,
  assignToBuckets,
  generateBucketStarts,
  listStatisticV2Outputs,
  nextBucketStart,
  parseStatisticV2Binary,
  type StatisticV2Output,
  type StatisticV2Row
} from './StatisticV2.js';

// Re-export the response type for convenience
export type { StatisticsResponse } from '../types/statistics.js';

/**
 * StatisticsService retrieves and processes historical data from Loxone controls.
 * 
 * Responsibilities:
 * - Fetches historical statistics data from controls with statistics enabled
 * - Handles various time periods (day, week, month, year) with appropriate aggregation
 * - Performs data aggregation (hourly, daily, weekly, monthly) based on period
 * - Calculates statistical summaries (min, max, average, total)
 * - Manages time zone conversions and Loxone epoch time calculations
 * - Determines available date ranges for statistics
 * 
 * This service enables historical analysis and monitoring of control values
 * over time.
 */
@injectable()
export class StatisticsService {
  private structure: StructureFile | null = null;
  private logger: Logger;

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly timeService: TimeService
  ) {
    this.logger = container.resolve(Logger);
  }

  public updateStructure(structure: StructureFile | null): void {
    this.structure = structure;
  }

  public async getStatistics(controlUuid: string, period: StatisticsPeriod, customFrom?: string, customTo?: string): Promise<StatisticsResponse> {
    try {
      // Get control to check if it has statistics
      const control = this.structure?.controls[controlUuid];
      if (!control) {
        throw new Error(`Control ${controlUuid} not found`);
      }
      const hasV2 = !!control.statisticV2;
      const hasV1 = !!control.statistic;
      if (!hasV1 && !hasV2) {
        throw new Error(`Control ${controlUuid} does not have statistics enabled`);
      }
      // Calculate time range and aggregation based on period (or custom from/to range)
      const { fromTimestamp, toTimestamp, aggregationInterval } = (customFrom || customTo)
        ? this.calculateCustomRange(customFrom, customTo)
        : this.timeService.calculateTimeRange(period);
      let v2Outputs: StatisticV2Output[] = [];
      let v2Selected: StatisticV2Output | undefined;
      if (hasV2) {
        const requested = this.selectedOutput;
        this.selectedOutput = 1;
        v2Outputs = listStatisticV2Outputs(control.statisticV2 as ControlStatisticV2);
        v2Selected = v2Outputs[requested - 1];
        if (!v2Selected) {
          const available = v2Outputs.map(o => `${o.index}=${o.title} (${o.unit})`).join(', ') || 'none';
          throw new Error(`Control ${controlUuid} has no statistics output ${requested}. Available outputs: ${available}`);
        }
      }

      // Try to fetch actual statistics data via HTTP
      try {
        if (hasV2 && v2Selected) {
          return await this.getV2Statistics(
            control.name, controlUuid, period, fromTimestamp, toTimestamp, aggregationInterval, v2Outputs, v2Selected
          );
        }
        // Fetch statistics metadata
        const statsData = await this.fetchStatisticsMetadata();
        const availableDates = this.findAvailableDates(statsData, controlUuid);
        this.logger.debug('StatisticsService', `Found ${availableDates.length} statistics files for control`);
        // For v1 statistics, fetch and process data
        if (hasV1 && !hasV2) {
          if (availableDates.length === 0) {
            // Statistics were enabled but the Miniserver has not written any file yet
            // (freshly enabled sensor). Fetching blindly can hang the Gen1 HTTP server
            // and previously returned data belonging to OTHER controls.
            return {
              type: 'v1',
              control: control.name,
              uuid: controlUuid,
              period,
              aggregationLevel: aggregationInterval,
              from: this.timeService.convertTimestampToControllerTime(fromTimestamp, true),
              to: this.timeService.convertTimestampToControllerTime(toTimestamp, true),
              statisticsAvailable: false,
              totalDataPoints: 0,
              aggregatedData: [],
              summary: { message: 'No statistics file exists yet for this control. Data will appear after the Miniserver writes its first samples.' }
            } as unknown as V1StatisticsResponse;
          }
          const { dataPoints: allDataPoints, outputNames, columnCount } = await this.fetchV1Statistics(
            controlUuid,
            fromTimestamp,
            toTimestamp,
            availableDates
          );
          const aggregatedData = this.aggregateData(allDataPoints, aggregationInterval);
          const summary = this.calculateSummary(allDataPoints);
          const response: V1StatisticsResponse = {
            type: 'v1',
            control: control.name,
            uuid: controlUuid,
            period,
            aggregationLevel: aggregationInterval,
            from: this.timeService.convertTimestampToControllerTime(fromTimestamp, true),
            to: this.timeService.convertTimestampToControllerTime(toTimestamp, true),
            statisticsAvailable: true,
            totalDataPoints: allDataPoints.length,
            aggregatedData,
            summary
          };
          if (columnCount > 1) {
            (response as unknown as Record<string, unknown>).multiOutput = {
              note: `This statistics file contains ${columnCount} output columns; values above are column 1. Use the 'output' parameter (1-${columnCount}) to select another column.`,
              outputs: outputNames
            };
          }
          return response;
        }
      } catch (fileError) {
        this.logger.error('StatisticsService', 'File command failed:', fileError);
        // Return fallback metadata
        return this.createFallbackResponse(
          control, 
          controlUuid, 
          period, 
          fromTimestamp, 
          toTimestamp, 
          hasV2
        );
      }
    } catch (error) {
      this.logger.error('StatisticsService', 'Statistics fetch failed:', error);
      throw error;
    }
    // This should never be reached, but TypeScript needs it
    throw new Error('Unexpected statistics response state');
  }

  private async fetchStatisticsMetadata(): Promise<StatisticsMetadata | null> {
    this.logger.debug('StatisticsService', 'Fetching statistics metadata via HTTP...');
    const statsResponse = await this.connectionManager.fetch(`stats/statistics.json`);
    if (statsResponse.ok) {
      const statsText = await statsResponse.text();
      try {
        return JSON.parse(statsText);
      } catch (e) {
        this.logger.error('StatisticsService', 'Failed to parse statistics.json:', e);
      }
    }
    return null;
  }

  private findAvailableDates(statsData: StatisticsMetadata | null, controlUuid: string): StatisticsAvailableDate[] {
    const availableDates: StatisticsAvailableDate[] = [];
    if (statsData?.Statisticfiles?.File) {
      for (const file of statsData.Statisticfiles.File) {
        if (file.UUID === controlUuid) {
          availableDates.push({
            year: file.Year,
            month: file.Month,
            groupId: file.GroupId
          });
        }
      }
    }
    return availableDates;
  }

  /** Selected output column (1-based) for multi-output statistics files. */
  private selectedOutput = 1;
  public setOutputColumn(output?: number): void {
    this.selectedOutput = output && output >= 1 ? Math.floor(output) : 1;
  }

  private async fetchV1Statistics(
    controlUuid: string,
    fromTimestamp: number,
    toTimestamp: number,
    availableDates: StatisticsAvailableDate[]
  ): Promise<{ dataPoints: StatisticsDataPoint[]; outputNames: string[]; columnCount: number }> {
    const monthsNeeded = this.getMonthsForPeriod(fromTimestamp, toTimestamp);
    // Only fetch months for which the Miniserver actually lists a statistics file
    // for THIS uuid (statistics.json is authoritative) — never fetch blindly.
    const existing = new Set(availableDates.map(d => `${d.year}${String(d.month).padStart(2, '0')}`));
    const months = monthsNeeded.filter(m => existing.has(m));
    const allDataPoints: StatisticsDataPoint[] = [];
    let columnCount = 1;
    for (const monthStr of months) {
      try {
        // Primary: canonical static statistics file (unambiguous, served straight
        // from the Miniserver filesystem). The legacy statisticdata.xml endpoint
        // has been observed returning data belonging to OTHER controls on Gen1.
        let xmlResponse = await this.connectionManager.fetch(`stats/${controlUuid}.${monthStr}.xml`);
        if (!xmlResponse.ok) {
          const xmlUrl = `stats/statisticdata.xml/${controlUuid}/${monthStr}`;
          this.logger.debug('StatisticsService', `Canonical file not found, falling back to: ${xmlUrl}`);
          xmlResponse = await this.connectionManager.fetch(xmlUrl);
        }
        if (xmlResponse.ok) {
          const xmlText = await xmlResponse.text();
          const { dataPoints, columns } = this.parseStatisticsXml(xmlText, fromTimestamp, toTimestamp, this.selectedOutput);
          columnCount = Math.max(columnCount, columns);
          allDataPoints.push(...dataPoints);
        }
      } catch (err) {
        this.logger.debug('StatisticsService', `Could not fetch ${monthStr}:`, err);
      }
    }
    const control = this.structure?.controls[controlUuid];
    const outputNames = (control?.statistic?.outputs || []).map((o: { name: string }) => o.name);
    this.selectedOutput = 1; // reset after use
    return { dataPoints: allDataPoints.sort((a, b) => a.timestamp - b.timestamp), outputNames, columnCount };
  }

  private async getV2Statistics(
    controlName: string,
    controlUuid: string,
    period: StatisticsPeriod,
    fromTimestamp: number,
    toTimestamp: number,
    interval: AggregationInterval,
    outputs: StatisticV2Output[],
    selected: StatisticV2Output
  ): Promise<V2StatisticsResponse> {
    const offset = this.controllerOffsetSeconds();
    const meter = selected.accumulated ? selected : outputs.find(o => o.accumulated);
    const bucketInterval = selected.accumulated && interval === AggregationInterval.Minute ? AggregationInterval.Hour : interval;
    const from = alignToBucketStart(fromTimestamp, bucketInterval, offset);
    // Loxone's own month buckets drift off the calendar when local midnight is not UTC
    // midnight (observed on a live Miniserver: Oct 1, Oct 31, Dec 1, Dec 31, ...), so months
    // are summed from daily diffs instead.
    const diffUnit = interval === AggregationInterval.Minute ? AggregationInterval.Hour
      : interval === AggregationInterval.Month ? AggregationInterval.Day
      : interval;
    const diffFrom = alignToBucketStart(fromTimestamp, interval === AggregationInterval.Minute ? AggregationInterval.Hour : interval, offset);
    const diffRows = meter
      ? await this.fetchV2Rows(controlUuid, 'diff', diffFrom, toTimestamp, diffUnit, meter)
      : [];
    const samples = selected.accumulated
      ? []
      : (await this.fetchV2Rows(controlUuid, 'raw', from, toTimestamp, 'all', selected))
        .map(row => ({ timestamp: row.timestamp, value: row.values[0] }))
        .filter(sample => sample.timestamp >= from && sample.timestamp <= toTimestamp && Number.isFinite(sample.value));

    // Hour and day diff rows start on the Miniserver's local boundaries including DST, so they
    // are the most accurate bucket edges; each diff row is matched to a bucket by its midpoint.
    const starts = diffRows.length > 0 && diffUnit === bucketInterval
      ? diffRows.map(row => row.timestamp)
      : generateBucketStarts(from, toTimestamp, bucketInterval, offset);
    for (let next = nextBucketStart(starts[starts.length - 1], bucketInterval, offset); next <= toTimestamp; next = nextBucketStart(next, bucketInterval, offset)) {
      starts.push(next);
    }
    const halfDiffUnit = diffUnit === AggregationInterval.Hour ? 1800 : 43200;
    const consumptionBuckets = bucketInterval === AggregationInterval.Minute ? [] : assignToBuckets(
      diffRows.map(row => ({ timestamp: row.timestamp + halfDiffUnit, value: row.values[0] })),
      starts,
      Number.POSITIVE_INFINITY
    );
    const consumptionByStart = new Map(consumptionBuckets
      .filter(bucket => bucket.values.length > 0)
      .map(bucket => [bucket.start, bucket.values.reduce((a, b) => a + b, 0)]));
    const round = (value: number) => parseFloat(value.toFixed(3));
    const at = (timestamp: number) => this.timeService.convertTimestampToControllerTime(timestamp, true);
    // A day bucket from the other side of a DST change starts an hour off the current offset.
    const bucketLabel = (start: number) => at(bucketInterval === AggregationInterval.Day
      ? alignToBucketStart(start + 43200, AggregationInterval.Day, offset)
      : start);

    const aggregatedData: V2AggregatedDataPoint[] = [];
    let summaryPoints: StatisticsDataPoint[];
    if (selected.accumulated) {
      summaryPoints = [];
      for (const [start, total] of consumptionByStart) {
        const value = round(total);
        aggregatedData.push({ timestamp: bucketLabel(start), average: value, min: value, max: value, count: 1, consumption: value });
        summaryPoints.push({ timestamp: start, value: total, date: new Date(start * 1000) });
      }
    } else if (bucketInterval === AggregationInterval.Minute) {
      for (const sample of samples) {
        const value = round(sample.value);
        aggregatedData.push({ timestamp: at(sample.timestamp), average: value, min: value, max: value, count: 1 });
      }
      summaryPoints = samples.map(sample => ({ ...sample, date: new Date(sample.timestamp * 1000) }));
    } else {
      for (const bucket of assignToBuckets(samples, starts, toTimestamp)) {
        if (bucket.values.length === 0) continue;
        const consumption = consumptionByStart.get(bucket.start);
        aggregatedData.push({
          timestamp: bucketLabel(bucket.start),
          average: round(bucket.values.reduce((a, b) => a + b, 0) / bucket.values.length),
          min: round(Math.min(...bucket.values)),
          max: round(Math.max(...bucket.values)),
          count: bucket.values.length,
          ...(consumption !== undefined && { consumption: round(consumption) })
        });
      }
      summaryPoints = samples.map(sample => ({ ...sample, date: new Date(sample.timestamp * 1000) }));
    }

    const toInfo = (o: StatisticV2Output): V2OutputInfo => ({ index: o.index, title: o.title, output: o.output, unit: o.unit, accumulated: o.accumulated });
    const consumptionPer = bucketInterval === AggregationInterval.Minute ? 'range starting at consumption.from' : `${bucketInterval} bucket`;
    const describeMeter = (o: StatisticV2Output) =>
      `${o.title} (output '${o.output}') used per ${consumptionPer} in ${o.unit}, the difference of the counter, not the counter reading`;
    const valueDescription = selected.accumulated
      ? `average/min/max/consumption: ${describeMeter(selected)}.`
      : `average/min/max: ${selected.title} (output '${selected.output}') in ${selected.unit}, recorded ${selected.sampling}.` +
        (meter ? ` consumption: ${describeMeter(meter)}; consumption.total covers the whole range.` : '');

    return {
      type: 'v2',
      control: controlName,
      uuid: controlUuid,
      period,
      aggregationLevel: bucketInterval,
      from: at(from),
      to: at(toTimestamp),
      statisticsAvailable: true,
      totalDataPoints: selected.accumulated ? diffRows.length : samples.length,
      aggregatedData,
      summary: this.calculateSummary(summaryPoints),
      valueDescription,
      selectedOutput: toInfo(selected),
      outputs: outputs.map(toInfo),
      ...(meter && {
        consumption: {
          title: meter.title,
          output: meter.output,
          unit: meter.unit,
          from: at(diffFrom),
          total: round(diffRows.reduce((sum, row) => sum + row.values[0], 0))
        }
      })
    };
  }

  private async fetchV2Rows(
    controlUuid: string,
    kind: 'raw' | 'diff',
    from: number,
    to: number,
    unit: string,
    output: StatisticV2Output
  ): Promise<StatisticV2Row[]> {
    const path = `jdev/sps/getStatistic/${controlUuid}/${kind}/${from}/${to}/${unit}/${output.groupId}/${output.output}`;
    const response = await this.connectionManager.fetch(path);
    if (!response.ok) {
      throw new Error(`Miniserver returned HTTP ${response.status} for ${path}`);
    }
    // Errors (e.g. unknown group or output) arrive as a JSON LL envelope with HTTP 200.
    if ((response.headers.get('content-type') ?? '').includes('json')) {
      throw new Error(`Miniserver rejected ${path}: ${(await response.text()).slice(0, 200)}`);
    }
    return parseStatisticV2Binary(new Uint8Array(await response.arrayBuffer()));
  }

  private controllerOffsetSeconds(): number {
    const m = this.timeService.getControllerTimeOffset().match(/([+-])(\d{2}):(\d{2})/);
    if (!m) return 0;
    return (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) * 3600 + parseInt(m[3]) * 60);
  }

  private parseStatisticsXml(
    xmlText: string,
    fromTimestamp: number,
    toTimestamp: number,
    outputColumn = 1
  ): { dataPoints: StatisticsDataPoint[]; columns: number } {
    const dataPoints: StatisticsDataPoint[] = [];
    let columns = 1;
    // Match every <S .../> element, then read T and ALL value columns (V, V2, V3, ...).
    // The previous single-column regex silently returned the wrong series (or nothing)
    // for multi-output statistics files.
    const elements = xmlText.matchAll(/<S\s+([^>]*?)\/>/g);
    const matches: Array<[string, string, string]> = [];
    for (const el of elements) {
      const attrs = el[1];
      const t = /(?:^|\s)T="([^"]+)"/.exec(attrs)?.[1];
      if (!t) continue;
      const vals: string[] = [];
      for (const vm of attrs.matchAll(/(?:^|\s)V(\d*)="([^"]+)"/g)) {
        const idx = vm[1] === '' ? 1 : parseInt(vm[1]);
        vals[idx - 1] = vm[2];
      }
      if (vals.length === 0) continue;
      columns = Math.max(columns, vals.length);
      const chosen = vals[Math.min(outputColumn, vals.length) - 1];
      if (chosen === undefined) continue;
      matches.push(['', t, chosen] as [string, string, string]);
    }
    for (const match of matches) {
      let timestamp: number;
      const timeStr = match[1];
      const value = parseFloat(match[2]);
      // Check if timestamp is already a number or a date string
      const offsetSec = this.controllerOffsetSeconds();
      if (/^\d+$/.test(timeStr)) {
        timestamp = parseInt(timeStr);
        // Loxone epoch (seconds since 2009-01-01, controller local time) vs Unix epoch
        if (timestamp < 1e9) {
          timestamp = timestamp + 1230768000 - offsetSec;
        }
      } else {
        // Date strings in statistics files are CONTROLLER LOCAL time, not UTC.
        // Parsing them as UTC shifted every point by the timezone offset.
        timestamp = Math.floor(new Date(timeStr + ' UTC').getTime() / 1000) - offsetSec;
      }
      // Only include data within our time range
      if (timestamp >= fromTimestamp && timestamp <= toTimestamp) {
        dataPoints.push({
          timestamp,
          value,
          date: new Date(timestamp * 1000)
        });
      }
    }
    return { dataPoints, columns };
  }

  private calculateCustomRange(customFrom?: string, customTo?: string): {
    fromTimestamp: number; toTimestamp: number; aggregationInterval: AggregationInterval
  } {
    const isoOffset = this.timeService.getControllerTimeOffset().match(/[+-]\d{2}:\d{2}/)?.[0] || '+00:00';
    const withTz = (s: string) => (/(Z|[+-]\d{2}:?\d{2})$/.test(s.trim()) ? s : s.trim() + isoOffset);
    const toTimestamp = customTo ? Math.floor(new Date(withTz(customTo)).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const fromTimestamp = customFrom ? Math.floor(new Date(withTz(customFrom)).getTime() / 1000) : toTimestamp - 86400;
    if (isNaN(fromTimestamp) || isNaN(toTimestamp) || fromTimestamp >= toTimestamp) {
      throw new Error('Invalid from/to range: use ISO dates, from must be before to');
    }
    const spanH = (toTimestamp - fromTimestamp) / 3600;
    const aggregationInterval = spanH <= 6 ? AggregationInterval.Minute
      : spanH <= 96 ? AggregationInterval.Hour
      : spanH <= 24 * 92 ? AggregationInterval.Day
      : AggregationInterval.Month;
    return { fromTimestamp, toTimestamp, aggregationInterval };
  }

  private getMonthsForPeriod(fromTimestamp: number, toTimestamp: number): string[] {
    // Statistics files are named after the CONTROLLER-LOCAL month (stats/<uuid>.<yyyymm>.xml).
    // Deriving the month via toISOString() (UTC) skips a whole month for windows starting
    // near a local month boundary (e.g. local Aug 1st 00:00 = Jul 31st 22:00 UTC -> only the
    // July file was fetched). Shift timestamps by the controller offset before formatting.
    const offsetSec = this.parseOffsetSeconds(this.timeService.getControllerTimeOffset());
    const localYm = (ts: number) => new Date((ts + offsetSec) * 1000).toISOString().slice(0, 7).replace('-', '');
    const months: string[] = [];
    const endYm = localYm(toTimestamp);
    let cursor = fromTimestamp;
    for (let guard = 0; guard < 240; guard++) {
      const ym = localYm(cursor);
      if (!months.includes(ym)) months.push(ym);
      if (ym === endYm) break;
      cursor += 28 * 86400; // advance safely; dedup handles overlaps
    }
    return months;
  }

  private parseOffsetSeconds(offset: string): number {
    const m = offset.match(/([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) * 3600 + parseInt(m[3]) * 60) : 0;
  }

  private aggregateData(dataPoints: StatisticsDataPoint[], interval: AggregationInterval): AggregatedDataPoint[] {
    if (dataPoints.length === 0) return [];
    const aggregated: AggregatedDataPoint[] = [];
    const buckets: { [key: string]: StatisticsDataPoint[] } = {};
    const offset = this.timeService.getControllerTimeOffset();
    // Parse offset to get hours and minutes for timezone adjustment
    const offsetMatch = offset.match(/([+-])(\d{2}):(\d{2})/);
    const offsetMinutes = offsetMatch ? 
      (offsetMatch[1] === '+' ? 1 : -1) * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) : 0;
    // Format ISO offset string
    const isoOffset = offsetMatch ? 
      `${offsetMatch[1]}${String(offsetMatch[2]).padStart(2, '0')}:${String(offsetMatch[3]).padStart(2, '0')}` : 
      '+00:00';
    // Group data into buckets based on interval
    for (const point of dataPoints) {
      let bucketKey: string;
      const adjustedDate = dayjs(point.date).add(offsetMinutes, 'minute');
      switch (interval) {
        case AggregationInterval.Minute:
          bucketKey = adjustedDate.format('YYYY-MM-DDTHH:mm:ss') + isoOffset;
          break;
        case AggregationInterval.Hour:
          bucketKey = adjustedDate.format('YYYY-MM-DDTHH:00:00') + isoOffset;
          break;
        case AggregationInterval.Day:
          bucketKey = adjustedDate.format('YYYY-MM-DDT00:00:00') + isoOffset;
          break;
        case AggregationInterval.Month:
          bucketKey = adjustedDate.format('YYYY-MM-01T00:00:00') + isoOffset;
          break;
        default:
          bucketKey = point.timestamp?.toString() || '';
      }
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = [];
      }
      buckets[bucketKey].push(point);
    }
    // Calculate averages for each bucket
    for (const [, points] of Object.entries(buckets)) {
      const values = points.map(p => p.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      aggregated.push({
        timestamp: this.timeService.convertTimestampToControllerTime(points[0].timestamp, true),
        average: parseFloat(avg.toFixed(2)),
        min: parseFloat(min.toFixed(2)),
        max: parseFloat(max.toFixed(2)),
        count: points.length
      });
    }
    return aggregated.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return aTime - bTime;
    });
  }

  private calculateSummary(dataPoints: StatisticsDataPoint[]): StatisticsSummary | { message: string } {
    if (dataPoints.length === 0) {
      return { message: 'No data available for this period' };
    }

    const values = dataPoints.map(p => p.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const minPoint = dataPoints.find(p => p.value === minValue);
    const maxPoint = dataPoints.find(p => p.value === maxValue);
    
    return {
      highest: {
        value: parseFloat(maxValue.toFixed(2)),
        timestamp: maxPoint?.timestamp,
        date: maxPoint?.date.toISOString()
      },
      lowest: {
        value: parseFloat(minValue.toFixed(2)),
        timestamp: minPoint?.timestamp,
        date: minPoint?.date.toISOString()
      },
      average: parseFloat(avgValue.toFixed(2)),
      totalMeasurements: dataPoints.length
    };
  }

  private createFallbackResponse(
    control: { name: string; statistic?: { frequency?: number; outputs?: Array<{ id: number; name: string }> }; statisticV2?: ControlStatisticV2 },
    controlUuid: string,
    period: StatisticsPeriod,
    fromTimestamp: number,
    toTimestamp: number,
    hasV2: boolean
  ): FallbackStatisticsResponse {
    const { aggregationInterval } = this.timeService.calculateTimeRange(period);
    const response: FallbackStatisticsResponse = {
      type: hasV2 ? 'v2' : 'v1',
      control: control.name,
      uuid: controlUuid,
      period,
      aggregationLevel: aggregationInterval,
      from: this.timeService.convertTimestampToControllerTime(fromTimestamp, true),
      to: this.timeService.convertTimestampToControllerTime(toTimestamp, true),
      statisticsAvailable: true,
      error: 'Could not fetch actual data',
      frequency: control.statistic?.frequency,
      outputs: control.statistic?.outputs || [],
      groups: control.statisticV2?.groups || [],
      info: 'Statistics metadata available but data fetch failed'
    };
    return response;
  }
}