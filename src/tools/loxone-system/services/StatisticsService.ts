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
  FallbackStatisticsResponse
} from '../types/statistics.js';
import { TimeService } from './TimeService.js';
import { Logger } from '../../../utils/Logger.js';
import { ConnectionManager } from './ConnectionManager.js';

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

      // Try to fetch actual statistics data via HTTP
      try {
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
        // For v2 statistics (binary format)
        if (hasV2) {
          const response: V2StatisticsResponse = {
            type: 'v2',
            control: control.name,
            uuid: controlUuid,
            period,
            aggregationLevel: aggregationInterval,
            from: this.timeService.convertTimestampToControllerTime(fromTimestamp, true),
            to: this.timeService.convertTimestampToControllerTime(toTimestamp, true),
            statisticsAvailable: true,
            summary: {
              message: 'V2 statistics use binary format. Data exists but requires binary parsing.',
              availableFiles: availableDates.length
            },
          };
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
    const months: string[] = [];
    const fromDate = new Date(fromTimestamp * 1000);
    const toDate = new Date(toTimestamp * 1000);
    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const yearMonth = currentDate.toISOString().slice(0, 7).replace('-', '');
      if (!months.includes(yearMonth)) {
        months.push(yearMonth);
      }
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    return months;
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
    control: { name: string; statistic?: { frequency?: number; outputs?: Array<{ id: number; name: string }> }; statisticV2?: { groups?: Array<{ id: number; name: string; outputs: Array<{ id: number; name: string; format: string }> }> } },
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