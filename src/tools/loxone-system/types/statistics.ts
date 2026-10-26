import { StatisticsPeriod, AggregationInterval } from './structure.js';
import type { ControlStatisticV2Group } from './control-structure.js';

export interface StatisticsMetadata {
  Statisticfiles?: {
    File: Array<{
      UUID: string;
      Year: string;
      Month: string;
      GroupId: string;
    }>;
  };
}

export interface StatisticsDataPoint {
  timestamp: number;
  value: number;
  date: Date;
}

export interface AggregatedDataPoint {
  timestamp: string;
  average: number;
  min: number;
  max: number;
  count: number;
}

export interface StatisticsSummary {
  highest: {
    value: number;
    timestamp?: number;
    date?: string;
  };
  lowest: {
    value: number;
    timestamp?: number;
    date?: string;
  };
  average: number;
  totalMeasurements: number;
}

export interface StatisticsAvailableDate {
  year: string;
  month: string;
  groupId: string;
}

interface BaseStatisticsResponse {
  control: string;
  uuid: string;
  period: StatisticsPeriod;
  aggregationLevel: AggregationInterval;
  from: string;
  to: string;
  statisticsAvailable: boolean;
}

export interface V1StatisticsResponse extends BaseStatisticsResponse {
  type: 'v1';
  totalDataPoints: number;
  aggregatedData: AggregatedDataPoint[];
  summary: StatisticsSummary | { message: string };
}

export interface V2AggregatedDataPoint extends AggregatedDataPoint {
  consumption?: number;
}

export interface V2OutputInfo {
  index: number;
  title: string;
  output: string;
  unit: string;
  accumulated: boolean;
}

export interface V2StatisticsResponse extends BaseStatisticsResponse {
  type: 'v2';
  totalDataPoints: number;
  aggregatedData: V2AggregatedDataPoint[];
  summary: StatisticsSummary | { message: string };
  valueDescription: string;
  selectedOutput: V2OutputInfo;
  outputs: V2OutputInfo[];
  consumption?: {
    title: string;
    output: string;
    unit: string;
    from: string;
    total: number;
  };
}

export interface FallbackStatisticsResponse extends BaseStatisticsResponse {
  type: 'v1' | 'v2';
  error: string;
  frequency?: number;
  outputs?: Array<{
    id: number;
    name: string;
  }>;
  groups?: ControlStatisticV2Group[];
  info: string;
}

export type StatisticsResponse = V1StatisticsResponse | V2StatisticsResponse | FallbackStatisticsResponse;