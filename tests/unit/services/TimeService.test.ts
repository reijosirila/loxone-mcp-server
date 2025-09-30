import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { TimeService } from '../../../src/tools/loxone-system/services/TimeService.js';
import { StateManager } from '../../../src/tools/loxone-system/services/StateManager.js';
import { ConnectionManager } from '../../../src/tools/loxone-system/services/ConnectionManager.js';
import { Logger } from '../../../src/utils/Logger.js';
import { StatisticsPeriod, AggregationInterval } from '../../../src/tools/loxone-system/types/structure.js';
import type { StructureFile } from '../../../src/tools/loxone-system/types/structure.js';

describe('TimeService', () => {
  let timeService: TimeService;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocks
    mockStateManager = {
      set: jest.fn(),
      get: jest.fn(),
      getValue: jest.fn(),
      updateValue: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getAll: jest.fn(),
      has: jest.fn(),
      size: 0,
      cleanup: jest.fn()
    } as any;

    mockConnectionManager = {
      sendCommand: jest.fn(),
      fetch: jest.fn(),
      isConnected: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    } as any;

    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    } as any;

    // Mock container resolution for Logger
    jest.spyOn(container, 'resolve').mockReturnValue(mockLogger);

    timeService = new TimeService(mockStateManager, mockConnectionManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateStructure', () => {
    it('should update structure and initialize miniserver time', async () => {
      const mockStructure: StructureFile = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;

      const mockResponse = {
        LL: {
          value: '2023-07-03 13:01:36 +02:00:00'
        },
        code: 200
      };

      mockConnectionManager.sendCommand.mockResolvedValue(mockResponse);

      await timeService.updateStructure(mockStructure);

      expect(mockConnectionManager.sendCommand).toHaveBeenCalledWith('jdev/sps/io/time-uuid-123');
      expect(mockStateManager.set).toHaveBeenCalledWith('time-uuid-123', {
        uuid: 'time-uuid-123',
        value: '2023-07-03 13:01:36 +02:00:00',
        lastUpdated: expect.any(Date)
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'TimeService',
        'Miniserver time: 2023-07-03 13:01:36 +02:00:00'
      );
    });

    it('should handle structure with no miniserverTime', async () => {
      const mockStructure: StructureFile = {
        globalStates: {}
      } as any;

      await timeService.updateStructure(mockStructure);

      expect(mockConnectionManager.sendCommand).not.toHaveBeenCalled();
      expect(mockStateManager.set).not.toHaveBeenCalled();
    });

    it('should handle null structure', async () => {
      await timeService.updateStructure(null);

      expect(mockConnectionManager.sendCommand).not.toHaveBeenCalled();
      expect(mockStateManager.set).not.toHaveBeenCalled();
    });

    it('should handle command failure gracefully', async () => {
      const mockStructure: StructureFile = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;

      mockConnectionManager.sendCommand.mockRejectedValue(new Error('Connection failed'));

      await timeService.updateStructure(mockStructure);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'TimeService',
        'Failed to get miniserver time:',
        expect.any(Error)
      );
    });

    it('should handle response without LL.value', async () => {
      const mockStructure: StructureFile = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;

      const mockResponse = { LL: { value: 0 }, code: 200 };
      mockConnectionManager.sendCommand.mockResolvedValue(mockResponse);

      await timeService.updateStructure(mockStructure);

      expect(mockStateManager.set).not.toHaveBeenCalled();
    });
  });

  describe('getControllerTimeOffset', () => {
    let mockStructure: StructureFile;

    beforeEach(() => {
      mockStructure = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;
    });

    it('should return correct offset from miniserver time', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 +02:00:00');

      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('+02:00');
    });

    it('should handle negative offset', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 08:01:36 -05:00:00');

      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('-05:00');
    });

    it('should handle offset without seconds', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 +02:30');

      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('+02:30');
    });

    it('should return UTC when no structure is available', () => {
      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('+00:00');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'TimeService',
        'No miniserverTime UUID found in globalStates'
      );
    });

    it('should return UTC when no miniserver time value is found', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue(undefined);

      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('+00:00');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'TimeService',
        'No miniserverTime value found in state cache'
      );
    });

    it('should return UTC when miniserver time value is not a string', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue(123456);

      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('+00:00');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'TimeService',
        'No miniserverTime value found in state cache'
      );
    });

    it('should return UTC when offset cannot be parsed', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 invalid_offset');

      const offset = timeService.getControllerTimeOffset();

      expect(offset).toBe('+00:00');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'TimeService',
        'Could not parse offset from miniserverTime:',
        '2023-07-03 13:01:36 invalid_offset'
      );
    });
  });

  describe('convertTimestampToControllerTime', () => {
    let mockStructure: StructureFile;

    beforeEach(() => {
      mockStructure = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;
    });

    it('should convert timestamp with positive offset (non-ISO format)', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 +02:00:00');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, false);

      // Should be 02:00 local time (UTC + 2 hours)
      expect(result).toContain('2023-01-01');
      expect(result).toContain('02:00:00');
    });

    it('should convert timestamp with negative offset (non-ISO format)', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 08:01:36 -05:00:00');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, false);

      // Should be 19:00 previous day local time (UTC - 5 hours)
      expect(result).toContain('2022-12-31');
      expect(result).toContain('19:00:00');
    });

    it('should convert timestamp with positive offset (ISO format)', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 +02:00:00');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, true);

      expect(result).toBe('2023-01-01T02:00:00+02:00');
    });

    it('should convert timestamp with negative offset (ISO format)', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 08:01:36 -05:00:00');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, true);

      expect(result).toBe('2022-12-31T19:00:00-05:00');
    });

    it('should handle 30-minute offset in ISO format', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 +05:30:00');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, true);

      expect(result).toBe('2023-01-01T05:30:00+05:30');
    });

    it('should fallback to UTC when offset is invalid (non-ISO format)', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 invalid_offset');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, false);

      expect(result).toContain('2023-01-01');
      expect(result).toContain('00:00:00');
    });

    it('should fallback to UTC when offset is invalid (ISO format)', async () => {
      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-07-03 13:01:36 invalid_offset');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, true);

      expect(result).toMatch(/2023-01-01T00:00:00\+00:00/);
    });

    it('should handle no structure (fallback to UTC)', () => {
      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = timeService.convertTimestampToControllerTime(timestamp, true);

      expect(result).toMatch(/2023-01-01T00:00:00\+00:00/);
    });
  });

  describe('calculateTimeRange', () => {
    let originalDate: DateConstructor;
    let mockDate: Date;

    beforeEach(() => {
      // Mock Date to have consistent testing
      originalDate = global.Date;
      mockDate = new Date('2023-07-15T12:00:00.000Z'); // Fixed date for testing
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());
    });

    afterEach(() => {
      global.Date = originalDate;
    });

    it('should calculate LastHour period correctly', () => {
      const result = timeService.calculateTimeRange(StatisticsPeriod.LastHour);

      const expectedTo = Math.floor(mockDate.getTime() / 1000);
      const expectedFrom = expectedTo - 3600; // 1 hour in seconds

      expect(result.toTimestamp).toBe(expectedTo);
      expect(result.fromTimestamp).toBe(expectedFrom);
      expect(result.aggregationInterval).toBe(AggregationInterval.Minute);
    });

    it('should calculate Last24Hours period correctly', () => {
      const result = timeService.calculateTimeRange(StatisticsPeriod.Last24Hours);

      const expectedTo = Math.floor(mockDate.getTime() / 1000);
      const expectedFrom = expectedTo - 86400; // 24 hours in seconds

      expect(result.toTimestamp).toBe(expectedTo);
      expect(result.fromTimestamp).toBe(expectedFrom);
      expect(result.aggregationInterval).toBe(AggregationInterval.Hour);
    });

    it('should calculate LastWeek period correctly', () => {
      const result = timeService.calculateTimeRange(StatisticsPeriod.LastWeek);

      const expectedTo = Math.floor(mockDate.getTime() / 1000);
      const expectedFrom = expectedTo - (7 * 86400); // 7 days in seconds

      expect(result.toTimestamp).toBe(expectedTo);
      expect(result.fromTimestamp).toBe(expectedFrom);
      expect(result.aggregationInterval).toBe(AggregationInterval.Hour);
    });

    it('should calculate LastMonth period correctly', () => {
      const result = timeService.calculateTimeRange(StatisticsPeriod.LastMonth);

      const expectedTo = Math.floor(mockDate.getTime() / 1000);
      const expectedFrom = expectedTo - (30 * 86400); // 30 days in seconds

      expect(result.toTimestamp).toBe(expectedTo);
      expect(result.fromTimestamp).toBe(expectedFrom);
      expect(result.aggregationInterval).toBe(AggregationInterval.Day);
    });

    it('should calculate LastYear period correctly', () => {
      const result = timeService.calculateTimeRange(StatisticsPeriod.LastYear);

      const expectedTo = Math.floor(mockDate.getTime() / 1000);
      const expectedFrom = expectedTo - (365 * 86400); // 365 days in seconds

      expect(result.toTimestamp).toBe(expectedTo);
      expect(result.fromTimestamp).toBe(expectedFrom);
      expect(result.aggregationInterval).toBe(AggregationInterval.Month);
    });

    it('should throw error for invalid period', () => {
      expect(() => {
        timeService.calculateTimeRange('InvalidPeriod' as StatisticsPeriod);
      }).toThrow('Invalid period: InvalidPeriod');
    });

    it('should handle all defined periods without throwing', () => {
      const periods = [
        StatisticsPeriod.LastHour,
        StatisticsPeriod.Last24Hours,
        StatisticsPeriod.LastWeek,
        StatisticsPeriod.LastMonth,
        StatisticsPeriod.LastYear
      ];

      periods.forEach(period => {
        expect(() => {
          const result = timeService.calculateTimeRange(period);
          expect(result.fromTimestamp).toBeLessThan(result.toTimestamp);
          expect(result.aggregationInterval).toBeDefined();
        }).not.toThrow();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete workflow from structure update to time conversion', async () => {
      const mockStructure: StructureFile = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;

      const mockResponse = {
        code: 200,
        LL: {
          value: '2023-07-03 15:30:45 +03:00:00'
        }
      };

      mockConnectionManager.sendCommand.mockResolvedValue(mockResponse);

      // Update structure (should initialize time)
      await timeService.updateStructure(mockStructure);

      // Mock state manager to return the time value
      mockStateManager.getValue.mockReturnValue('2023-07-03 15:30:45 +03:00:00');

      // Get offset
      const offset = timeService.getControllerTimeOffset();
      expect(offset).toBe('+03:00');

      // Convert timestamp
      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const converted = timeService.convertTimestampToControllerTime(timestamp, true);
      expect(converted).toBe('2023-01-01T03:00:00+03:00');

      // Calculate time range
      const timeRange = timeService.calculateTimeRange(StatisticsPeriod.LastHour);
      expect(timeRange.aggregationInterval).toBe(AggregationInterval.Minute);
      expect(timeRange.fromTimestamp).toBeLessThan(timeRange.toTimestamp);
    });

    it('should handle edge cases with timezone boundary crossings', async () => {
      const mockStructure: StructureFile = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;

      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-01-01 02:00:00 +14:00:00'); // UTC+14 (maximum offset)

      const offset = timeService.getControllerTimeOffset();
      expect(offset).toBe('+14:00');

      // Test timestamp that would cross date boundary
      const timestamp = 1672527600; // 2022-12-31 23:00:00 UTC
      const converted = timeService.convertTimestampToControllerTime(timestamp, true);
      expect(converted).toBe('2023-01-01T13:00:00+14:00'); // Should be next day in +14 timezone
    });

    it('should handle minimum timezone offset', async () => {
      const mockStructure: StructureFile = {
        globalStates: {
          miniserverTime: 'time-uuid-123'
        }
      } as any;

      await timeService.updateStructure(mockStructure);
      mockStateManager.getValue.mockReturnValue('2023-01-01 02:00:00 -12:00:00'); // UTC-12 (minimum offset)

      const offset = timeService.getControllerTimeOffset();
      expect(offset).toBe('-12:00');

      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const converted = timeService.convertTimestampToControllerTime(timestamp, true);
      expect(converted).toBe('2022-12-31T12:00:00-12:00'); // Should be previous day
    });
  });
});