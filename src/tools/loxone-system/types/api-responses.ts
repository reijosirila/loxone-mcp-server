// Loxone API Response Types

/** Shape of loxone-ts-api's TextMessage for a `jdev/...` command response. */
export interface TextCommandResponse {
  code?: number;
  control?: string;
  value?: unknown;
  data?: unknown;
}

export interface BinaryEvent {
  uuid: {
    stringValue?: string;
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
