import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { injectable, container } from 'tsyringe';
import { AggregationInterval, StatisticsPeriod, type StructureFile } from '../types/structure.js';
import { StateManager } from './StateManager.js';
import { ConnectionManager } from './ConnectionManager.js';
import { Logger } from '../../utils/Logger.js';

dayjs.extend(utc);

/**
 * TimeService manages time-related operations for the Loxone system.
 * 
 * Responsibilities:
 * - Synchronizes with Miniserver time for accurate correct timezone
 * - Converts between Loxone epoch time (2009-01-01) and standard Unix time
 * - Determines appropriate aggregation intervals based on time periods
 * - Calculates time ranges for statistics queries
 * - Provides utility functions for date/time formatting
 * - Ensures time consistency between MCP server and Miniserver
 * 
 * This service is crucial for accurate time-based operations, statistics
 * retrieval, and ensuring proper synchronization with the Miniserver's
 * timezone settings.
 */
@injectable()
export class TimeService {
  private structure: StructureFile | null = null;
  private logger: Logger;

  constructor(private readonly stateManager: StateManager, private readonly connectionManager: ConnectionManager) {
    this.logger = container.resolve(Logger);
  }

  public async updateStructure(structure: StructureFile | null) {
    this.structure = structure;
    await this.initializeMiniserverTime();
  }

  private async initializeMiniserverTime(): Promise<void> {
    if (this.structure?.globalStates?.miniserverTime) {
      try {
        const miniserverTimeUuid = this.structure.globalStates.miniserverTime;
        const response = await this.connectionManager.sendCommand(
          `jdev/sps/io/${miniserverTimeUuid}`
        );
        
        if (response?.LL?.value) {
          this.stateManager.set(miniserverTimeUuid, {
            uuid: miniserverTimeUuid,
            value: response.LL.value,
            lastUpdated: new Date()
          });
          this.logger.debug('TimeService', `Miniserver time: ${response.LL.value}`);
        }
      } catch (e) {
        this.logger.error('TimeService', 'Failed to get miniserver time:', e);
      }
    }
  }

  public getControllerTimeOffset(): string {
    // Get the miniserverTime UUID from globalStates
    const miniserverTimeUuid = this.structure?.globalStates?.miniserverTime;
    if (!miniserverTimeUuid) {
      this.logger.warn('TimeService', 'No miniserverTime UUID found in globalStates');
      return '+00:00'; // Default to UTC
    }
    
    // Get the current miniserver time from state cache
    const miniserverTime = this.stateManager.getValue(miniserverTimeUuid);
    if (!miniserverTime || typeof miniserverTime !== 'string') {
      this.logger.warn('TimeService', 'No miniserverTime value found in state cache');
      return '+00:00'; // Default to UTC
    }
    
    // Parse the UTC offset from the miniserver time string
    // Format: "2017-07-03 13:01:36 +02:00:00"
    const offsetMatch = miniserverTime.match(/([+-]\d{2}:\d{2}(?::\d{2})?)/); 
    if (offsetMatch) {
      // Convert offset format from +02:00:00 to +02:00 for standard offset format
      const offset = offsetMatch[1];
      const parts = offset.split(':');
      if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`;
      }
    }
    
    this.logger.warn('TimeService', 'Could not parse offset from miniserverTime:', miniserverTime);
    return '+00:00'; // Default to UTC
  }

  public convertTimestampToControllerTime(timestamp: number, useISOFormat: boolean = false): string {
    const offset = this.getControllerTimeOffset();
    
    // Parse offset to get hours and minutes
    const offsetMatch = offset.match(/([+-])(\d{2}):(\d{2})/);
    if (!offsetMatch) {
      // Fallback to UTC
      if (useISOFormat) {
        return dayjs.unix(timestamp).utc().toISOString();
      }
      return dayjs.unix(timestamp).utc().format();
    }
    
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2]);
    const minutes = parseInt(offsetMatch[3]);
    const offsetMinutes = (sign === '+' ? 1 : -1) * (hours * 60 + minutes);
    
    // Apply offset to UTC time
    const adjustedTime = dayjs.unix(timestamp).utc().add(offsetMinutes, 'minute');
    
    if (useISOFormat) {
      // Format as ISO 8601: "2017-07-03T13:01:36+02:00"
      const formattedDate = adjustedTime.format('YYYY-MM-DDTHH:mm:ss');
      const isoOffset = `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      return `${formattedDate}${isoOffset}`;
    }
    
    return adjustedTime.format();
  }

  public calculateTimeRange(period: StatisticsPeriod): { 
    fromTimestamp: number; 
    toTimestamp: number; 
    aggregationInterval: AggregationInterval 
  } {
    const now = new Date();
    const toTimestamp = Math.floor(now.getTime() / 1000);
    let fromTimestamp: number;
    let aggregationInterval: AggregationInterval;

    switch (period) {
      case StatisticsPeriod.LastHour:
        fromTimestamp = toTimestamp - 3600;
        aggregationInterval = AggregationInterval.Minute;
        break;
      case StatisticsPeriod.Last24Hours:
        fromTimestamp = toTimestamp - 86400;
        aggregationInterval = AggregationInterval.Hour;
        break;
      case StatisticsPeriod.LastWeek:
        fromTimestamp = toTimestamp - (7 * 86400);
        aggregationInterval = AggregationInterval.Hour;
        break;
      case StatisticsPeriod.LastMonth:
        fromTimestamp = toTimestamp - (30 * 86400);
        aggregationInterval = AggregationInterval.Day;
        break;
      case StatisticsPeriod.LastYear:
        fromTimestamp = toTimestamp - (365 * 86400);
        aggregationInterval = AggregationInterval.Month;
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    return { fromTimestamp, toTimestamp, aggregationInterval };
  }
}