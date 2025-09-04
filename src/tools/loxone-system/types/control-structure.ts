/**
 * Detailed type definitions for Loxone control structures
 */

import { ControlType } from './structure.js';

// @TODO: update interface to be accurate
export interface ControlDetails {
  format?: string;
  actualFormat?: string;
  totalFormat?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  text?: string;
  allOff?: boolean | string;
  favorites?: unknown[];
  timerModes?: Array<{
    id: number;
    name: string;
    description?: string;
  }>;
  controls?: string[];
  movementScene?: number;
  outputs?: Record<string, string>;
  masterColor?: string;
  entries?: Record<number, string>; // For TextStateControl
  [key: string]: unknown; // Allow additional properties
}

export interface ControlStatistic {
  frequency?: number;
  outputs?: Array<{
    id: number;
    name: string;
  }>;
}

export interface ControlStatisticV2 {
  groups?: Array<{
    id: number;
    name: string;
    outputs: Array<{
      id: number;
      name: string;
      format: string;
    }>;
  }>;
}

export interface LoxoneControlState {
  [key: string]: string | number | undefined;
}

// @TODO: update interface to be accurate
export interface LoxoneSubControl {
  name: string;
  type: string;
  uuidAction?: string;
  states?: LoxoneControlState;
  details?: ControlDetails;
}

// @TODO: update interface to be accurate
export interface LoxoneControl {
  name: string;
  type: ControlType | string;
  uuidAction: string;
  room?: string;
  cat?: string;
  states?: LoxoneControlState;
  details?: ControlDetails;
  statistic?: ControlStatistic;
  statisticV2?: ControlStatisticV2;
  subControls?: { [key: string]: LoxoneSubControl };
  defaultRating?: number;
  isFavorite?: boolean;
  isSecured?: boolean;
  restriction?: number;
}

// @TODO: update interface to be accurate
export interface LoxoneRoom {
  uuid: string;
  name: string;
  image?: string;
  defaultRating?: number;
  isFavorite?: boolean;
}

// @TODO: update interface to be accurate
export interface LoxoneCategory {
  uuid: string;
  name: string;
  image?: string;
  defaultRating?: number;
  isFavorite?: boolean;
  type?: string;
}

// @TODO: update interface to be accurate
export interface LoxoneStructureFile {
  lastModified: string;
  msInfo: {
    serialNr: string;
    msName: string;
    projectName: string;
    localUrl: string;
    remoteUrl: string;
    tempUnit: number;
    currency: string;
    squareMeasure: string;
    location: string;
    latitude: number;
    longitude: number;
    altitude: number;
    weatherServiceUrl: string;
    roomTitle: string;
    catTitle: string;
    currentUser: {
      name: string;
      uuid: string;
      isAdmin: boolean;
      changePassword: boolean;
      userRights: number;
    };
  };
  rooms: { [key: string]: LoxoneRoom };
  cats: { [key: string]: LoxoneCategory };
  controls: { [key: string]: LoxoneControl };
  globalStates?: { [key: string]: string };
}

// Type guards
export function isLoxoneControl(obj: unknown): obj is LoxoneControl {
  return typeof obj === 'object' && obj !== null && 'name' in obj && 'type' in obj && 'uuidAction' in obj;
}

export function isLoxoneSubControl(obj: unknown): obj is LoxoneSubControl {
  return typeof obj === 'object' && obj !== null && 'name' in obj && 'type' in obj;
}