// Import the Loxone types we need
import type { LoxoneControl, LoxoneRoom, LoxoneCategory } from './control-structure.js';

export interface LoxoneConfig {
  /** IP, hostname, or full base URL (e.g. https://my-miniserver.example:443) */
  host: string;
  username: string;
  password: string;
  port?: number;
  protocol?: 'http' | 'https';
  /** Miniserver serial number for Loxone cloud discovery when no host is configured */
  serialNumber?: string;
  /** How long startup waits for the Miniserver to become ready before failing */
  connectTimeoutMs?: number;
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
  // Implemented controls (dedicated control class)
  Switch = 'Switch',
  Dimmer = 'Dimmer',
  EIBDimmer = 'EIBDimmer',
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
  InfoOnlyText = 'InfoOnlyText',
  DigitalInput = 'DigitalInput',
  LightController = 'LightController',
  LightControllerV2 = 'LightControllerV2',
  Radio = 'Radio',
  TextState = 'TextState',
  CentralAudioZone = 'CentralAudioZone',
  CentralGate = 'CentralGate',
  CentralJalousie = 'CentralJalousie',
  CentralWindow = 'CentralWindow',
  Meter = 'Meter',
  IRoomController = 'IRoomController',
  IRoomControllerV2 = 'IRoomControllerV2',
  IntercomV2 = 'IntercomV2',
  Intercom = 'Intercom',
  Sauna = 'Sauna',
  EnergyManager2 = 'EnergyManager2',
  EnergyFlowMonitor = 'EnergyFlowMonitor',
  TimedSwitch = 'TimedSwitch',
  PresenceDetector = 'PresenceDetector',
  WindowMonitor = 'WindowMonitor',
  SmokeAlarm = 'SmokeAlarm',
  Hourcounter = 'Hourcounter',
  ValueSelector = 'ValueSelector',
  UpDownAnalog = 'UpDownAnalog',
  LeftRightAnalog = 'LeftRightAnalog',
  UpDownLeftRightAnalog = 'UpDownLeftRightAnalog',
  Fronius = 'Fronius',
  Tracker = 'Tracker',
  Daytimer = 'Daytimer',
  AlarmClock = 'AlarmClock',
  MailBox = 'MailBox',
  Ventilation = 'Ventilation',
  LoadManager = 'LoadManager',
  AalSmartAlarm = 'AalSmartAlarm',
  AalEmergency = 'AalEmergency',

  // Known Loxone types without a dedicated class (exposed read-only through GenericControl)
  AlarmChain = 'AlarmChain',
  Application = 'Application',
  CarCharger = 'CarCharger',
  ClimateController = 'ClimateController',
  ClimateControllerUS = 'ClimateControllerUS',
  EnergyManager = 'EnergyManager',
  Heatmixer = 'Heatmixer',
  Irrigation = 'Irrigation',
  LeftRightDigital = 'LeftRightDigital',
  LightsceneRGB = 'LightsceneRGB',
  MsShortcut = 'MsShortcut',
  NFCCodeTouch = 'NFCCodeTouch',
  PoolController = 'PoolController',
  PowerUnit = 'PowerUnit',
  PulseAt = 'PulseAt',
  Remote = 'Remote',
  Sequential = 'Sequential',
  SolarPumpController = 'SolarPumpController',
  SpotPriceOptimizer = 'SpotPriceOptimizer',
  StatusMonitor = 'StatusMonitor',
  SteakThermo = 'SteakThermo',
  SystemScheme = 'SystemScheme',
  TextInput = 'TextInput',
  UpDownDigital = 'UpDownDigital',
  UpDownLeftRightDigital = 'UpDownLeftRightDigital',
  Wallbox2 = 'Wallbox2',
  WallboxManager = 'WallboxManager',
  Webpage = 'Webpage',
  Window = 'Window',
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
  commandType: 'pulse' | 'setValue' | 'setEnum' | 'hsv' | 'setBrightness' | 'temp' | 'daylight' | 'setText';
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
  operatingModes?: { [id: string]: string };
}