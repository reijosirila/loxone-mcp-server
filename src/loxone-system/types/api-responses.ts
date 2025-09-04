// Loxone API Response Types

export interface TextCommandResponse {
  code: number;
  LL?: {
    control?: string;
    value: string | number | boolean;
    Code?: string;
  };
}

export interface BinaryEvent {
  uuid: {
    data1: Buffer;
    data2: Buffer;
    data3: Buffer;
    data4: Buffer;
  };
  value?: number | string;
  text?: string;
}

// Re-export statistics types from the dedicated statistics module
export type {
  StatisticsMetadata,
  StatisticsDataPoint,
  AggregatedDataPoint,
  StatisticsSummary,
  StatisticsAvailableDate,
  V1StatisticsResponse,
  V2StatisticsResponse,
  FallbackStatisticsResponse,
  StatisticsResponse
} from './statistics.js';