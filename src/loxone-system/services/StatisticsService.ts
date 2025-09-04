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
import { Logger } from '../../utils/Logger.js';
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

  public async getStatistics(controlUuid: string, period: StatisticsPeriod): Promise<StatisticsResponse> {
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
      // Calculate time range and aggregation based on period
      const { fromTimestamp, toTimestamp, aggregationInterval } = this.timeService.calculateTimeRange(period);

      // Try to fetch actual statistics data via HTTP
      try {
        // Fetch statistics metadata
        const statsData = await this.fetchStatisticsMetadata();
        const availableDates = this.findAvailableDates(statsData, controlUuid);
        this.logger.debug('StatisticsService', `Found ${availableDates.length} statistics files for control`);
        // For v1 statistics, fetch and process data
        if (hasV1 && !hasV2) {
          const allDataPoints = await this.fetchV1Statistics(
            controlUuid, 
            fromTimestamp, 
            toTimestamp
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

  private async fetchV1Statistics(
    controlUuid: string,
    fromTimestamp: number,
    toTimestamp: number
  ): Promise<StatisticsDataPoint[]> {
    const monthsNeeded = this.getMonthsForPeriod(fromTimestamp, toTimestamp);
    const allDataPoints: StatisticsDataPoint[] = [];
    
    for (const monthStr of monthsNeeded) {
      try {
        const xmlUrl = `stats/statisticdata.xml/${controlUuid}/${monthStr}`;
        this.logger.debug('StatisticsService', `Fetching statistics data: ${xmlUrl}`);
        const xmlResponse = await this.connectionManager.fetch(xmlUrl);
        if (xmlResponse.ok) {
          const xmlText = await xmlResponse.text();
          const dataPoints = this.parseStatisticsXml(xmlText, fromTimestamp, toTimestamp);
          allDataPoints.push(...dataPoints);
        }
      } catch (err) {
        this.logger.debug('StatisticsService', `Could not fetch ${monthStr}:`, err);
      }
    }
    
    // Sort data points by timestamp
    return allDataPoints.sort((a, b) => a.timestamp - b.timestamp);
  }

  private parseStatisticsXml(xmlText: string, fromTimestamp: number, toTimestamp: number): StatisticsDataPoint[] {
    const dataPoints: StatisticsDataPoint[] = [];
    const matches = xmlText.matchAll(/<S\s+T="([^"]+)"\s+V="([^"]+)"\/>/g);
    for (const match of matches) {
      let timestamp: number;
      const timeStr = match[1];
      const value = parseFloat(match[2]);
      // Check if timestamp is already a number or a date string
      if (/^\d+$/.test(timeStr)) {
        timestamp = parseInt(timeStr);
      } else {
        // Parse date string "YYYY-MM-DD HH:MM:SS"
        timestamp = Math.floor(new Date(timeStr + ' UTC').getTime() / 1000);
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
    return dataPoints;
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