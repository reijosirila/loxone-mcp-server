// Import the Loxone types we need
import type { LoxoneControl, LoxoneRoom, LoxoneCategory } from './control-structure.js';

export interface LoxoneConfig {
  host: string;
  username: string;
  password: string;
  port?: number;
}

export interface Room {
  uuid: string;
  name: string;
}

export interface Category {
  uuid: string;
  name: string;
  type?: string;
}

export enum ControlType {
  Switch = 'Switch',
  Dimmer = 'Dimmer',
  Jalousie = 'Jalousie',
  Gate = 'Gate',
  DigitalInput = 'DigitalInput',
  Pushbutton = 'Pushbutton',
  Slider = 'Slider',
  Intercom = 'Intercom',
  IRoomControllerV2 = 'IRoomControllerV2',
  IRoomController = 'IRoomController',
  Sauna = 'Sauna',
  Alarm = 'Alarm',
  CentralAlarm = 'CentralAlarm',
  AudioZone = 'AudioZone',
  ColorPicker = 'ColorPicker',
  ColorPickerV2 = 'ColorPickerV2',
  InfoOnlyDigital = 'InfoOnlyDigital',
  InfoOnlyAnalog = 'InfoOnlyAnalog',
  TextInput = 'TextInput',
  Webpage = 'Webpage',
  EIBDimmer = 'EIBDimmer',
  LightController = 'LightController',
  LightControllerV2 = 'LightControllerV2',
  Radio = 'Radio',
  TextState = 'TextState',
  AlarmClock = 'AlarmClock',
  AudioZoneV2 = 'AudioZoneV2',
  CentralAudioZone = 'CentralAudioZone',
  CentralGate = 'CentralGate',
  CentralJalousie = 'CentralJalousie',
  CentralWindow = 'CentralWindow',
  ClimateControllerUS = 'ClimateControllerUS',
  EFM = 'EFM',
  Meter = 'Meter',
  SpotPriceOptimizer = 'SpotPriceOptimizer',
  Daytimer = 'Daytimer',
  Unknown = 'Unknown'
}

export enum StatisticsPeriod {
  LastHour = 'lastHour',
  Last24Hours = 'last24hours',
  LastWeek = 'lastWeek',
  LastMonth = 'lastMonth',
  LastYear = 'lastYear'
}

export enum AggregationInterval {
  Minute = 'minute',
  Hour = 'hour',
  Day = 'day',
  Month = 'month'
}

export interface StateValue {
  uuid: string;
  value: unknown;
  lastUpdated: Date;
}

export interface ControlState {
  name: string;
  uuid: string;
  value: unknown;
  valueType: 'number' | 'boolean' | 'string' | 'object';
  unit?: string;
}

export interface ControlCommand {
  name: string;
  description: string;
  commandType: 'pulse' | 'setValue' | 'setEnum' | 'hsv' | 'setBrightness' | 'temp' | 'daylight';
  valueType?: 'number' | 'boolean' | 'string';
  min?: number;
  max?: number;
  step?: number;
  enumValues?: Array<{ value: unknown; label: string }>;
}

export interface StructureFile {
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