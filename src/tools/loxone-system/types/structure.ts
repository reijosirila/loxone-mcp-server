// Import the Loxone types we need
import type { LoxoneControl, LoxoneRoom, LoxoneCategory } from './control-structure.js';

export interface LoxoneConfig {
  host: string;
  username: string;
  password: string;
  port: number;
  protocol: 'http' | 'https';
  wsProtocol: 'ws' | 'wss';
  serialNumber: string;
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
  // Implemented Controls
  Switch = 'Switch',
  Dimmer = 'Dimmer',
  Jalousie = 'Jalousie',
  Gate = 'Gate',
  Pushbutton = 'Pushbutton',
  Slider = 'Slider',
  Alarm = 'Alarm',
  CentralAlarm = 'CentralAlarm',
  AudioZone = 'AudioZone',
  AudioZoneV2 = 'AudioZoneV2',
  ColorPicker = 'ColorPicker',
  ColorPickerV2 = 'ColorPickerV2',
  InfoOnlyDigital = 'InfoOnlyDigital',
  InfoOnlyAnalog = 'InfoOnlyAnalog',
  EIBDimmer = 'EIBDimmer',
  LightController = 'LightController',
  LightControllerV2 = 'LightControllerV2',
  Radio = 'Radio',
  TextState = 'TextState',
  CentralAudioZone = 'CentralAudioZone',
  CentralGate = 'CentralGate',
  CentralJalousie = 'CentralJalousie',
  CentralWindow = 'CentralWindow',
  Meter = 'Meter',
  IRoomControllerV2 = 'IRoomControllerV2',
  
  // Not Yet Implemented Controls
  AalEmergency = 'AalEmergency',
  AalSmartAlarm = 'AalSmartAlarm',
  AlarmChain = 'AlarmChain',
  AlarmClock = 'AlarmClock',
  Application = 'Application',
  CarCharger = 'CarCharger',
  ClimateController = 'ClimateController',
  ClimateControllerUS = 'ClimateControllerUS',
  Daytimer = 'Daytimer',
  DigitalInput = 'DigitalInput',
  EnergyManager = 'EnergyManager',
  EnergyManager2 = 'EnergyManager2',
  EnergyFlowMonitor = 'EnergyFlowMonitor',
  EFM = 'EFM',
  Fronius = 'Fronius',
  Heatmixer = 'Heatmixer',
  Hourcounter = 'Hourcounter',
  InfoOnlyText = 'InfoOnlyText',
  IRoomController = 'IRoomController',
  Intercom = 'Intercom',
  IntercomV2 = 'IntercomV2',
  Irrigation = 'Irrigation',
  LightsceneRGB = 'LightsceneRGB',
  LoadManager = 'LoadManager',
  MailBox = 'MailBox',
  MsShortcut = 'MsShortcut',
  NFCCodeTouch = 'NFCCodeTouch',
  PoolController = 'PoolController',
  PowerUnit = 'PowerUnit',
  PresenceDetector = 'PresenceDetector',
  PulseAt = 'PulseAt',
  Remote = 'Remote',
  Sauna = 'Sauna',
  Sequential = 'Sequential',
  SmokeAlarm = 'SmokeAlarm',
  SolarPumpController = 'SolarPumpController',
  SpotPriceOptimizer = 'SpotPriceOptimizer',
  StatusMonitor = 'StatusMonitor',
  SteakThermo = 'SteakThermo',
  SystemScheme = 'SystemScheme',
  TextInput = 'TextInput',
  TimedSwitch = 'TimedSwitch',
  Tracker = 'Tracker',
  UpDownLeftRightDigital = 'UpDownLeftRightDigital',
  UpDownLeftRightAnalog = 'UpDownLeftRightAnalog',
  ValueSelector = 'ValueSelector',
  Ventilation = 'Ventilation',
  Wallbox2 = 'Wallbox2',
  WallboxManager = 'WallboxManager',
  Webpage = 'Webpage',
  Window = 'Window',
  WindowMonitor = 'WindowMonitor',
  ACControl = 'ACControl',
  
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