import { ControlType, StateValue } from '../types/structure.js';
import type { LoxoneControl, LoxoneStructureFile } from '../types/control-structure.js';
import { AbstractControlType } from './AbstractControlType.js';
import { SwitchControl } from './SwitchControl.js';
import { DimmerControl } from './DimmerControl.js';
import { EIBDimmerControl } from './EIBDimmerControl.js';
import { ColorPickerControl } from './ColorPickerControl.js';
import { ColorPickerV2Control } from './ColorPickerV2Control.js';
import { LightController } from './LightController.js';
import { LightControllerV2Control } from './LightControllerV2Control.js';
import { JalousieControl } from './JalousieControl.js';
import { GateControl } from './GateControl.js';
import { SliderControl } from './SliderControl.js';
import { PushbuttonControl } from './PushbuttonControl.js';
import { AlarmControl } from './AlarmControl.js';
import { CentralAlarmControl } from './CentralAlarmControl.js';
import { MeterControl } from './MeterControl.js';
import { InfoOnlyDigitalControl } from './InfoOnlyDigitalControl.js';
import { InfoOnlyAnalogControl } from './InfoOnlyAnalogControl.js';
import { RadioControl } from './RadioControl.js';
import { IRoomControllerV2Control } from './IRoomControllerV2Control.js';
import { AudioZoneControl } from './AudioZoneControl.js';
import { AudioZoneV2Control } from './AudioZoneV2Control.js';
import { CentralAudioZoneControl } from './CentralAudioZoneControl.js';
import { CentralGateControl } from './CentralGateControl.js';
import { CentralJalousieControl } from './CentralJalousieControl.js';
import { CentralWindowControl } from './CentralWindowControl.js';
import { TextStateControl } from './TextStateControl.js';
import { GenericControl } from './GenericControl.js';
import { IntercomV2Control } from './IntercomV2Control.js';
import { SaunaControl } from './SaunaControl.js';
import { EnergyManager2Control } from './EnergyManager2Control.js';
import { EnergyFlowMonitorControl } from './EnergyFlowMonitorControl.js';
import { TimedSwitchControl } from './TimedSwitchControl.js';
import { PresenceDetectorControl } from './PresenceDetectorControl.js';
import { WindowMonitorControl } from './WindowMonitorControl.js';
import { SmokeAlarmControl } from './SmokeAlarmControl.js';
import { HourcounterControl } from './HourcounterControl.js';
import { InfoOnlyTextControl } from './InfoOnlyTextControl.js';
import { ValueSelectorControl } from './ValueSelectorControl.js';
import { FroniusControl } from './FroniusControl.js';
import { TrackerControl } from './TrackerControl.js';
import { DaytimerControl } from './DaytimerControl.js';
import { AlarmClockControl } from './AlarmClockControl.js';
import { IntercomControl } from './IntercomControl.js';
import { MailBoxControl } from './MailBoxControl.js';
import { VentilationControl } from './VentilationControl.js';
import { LoadManagerControl } from './LoadManagerControl.js';
import { AalControl } from './AalControl.js';

export type ControlConstructor = new (
  uuid: string,
  control: LoxoneControl,
  structure: LoxoneStructureFile,
  stateCache: Map<string, StateValue>
) => AbstractControlType;

export class ControlTypeFactory {
  // Map between ControlType enum and implementation class
  private static readonly controlTypeMap = new Map<ControlType, ControlConstructor>([
    [ControlType.Switch, SwitchControl],
    [ControlType.Dimmer, DimmerControl],
    [ControlType.EIBDimmer, EIBDimmerControl],
    [ControlType.ColorPicker, ColorPickerControl],
    [ControlType.ColorPickerV2, ColorPickerV2Control],
    [ControlType.LightController, LightController],
    [ControlType.LightControllerV2, LightControllerV2Control],
    [ControlType.Jalousie, JalousieControl],
    [ControlType.Gate, GateControl],
    [ControlType.Slider, SliderControl],
    [ControlType.Pushbutton, PushbuttonControl],
    [ControlType.Alarm, AlarmControl],
    [ControlType.CentralAlarm, CentralAlarmControl],
    [ControlType.Meter, MeterControl],
    [ControlType.InfoOnlyDigital, InfoOnlyDigitalControl],
    [ControlType.DigitalInput, InfoOnlyDigitalControl],
    [ControlType.InfoOnlyAnalog, InfoOnlyAnalogControl],
    [ControlType.Radio, RadioControl],
    [ControlType.IRoomControllerV2, IRoomControllerV2Control],
    [ControlType.IRoomController, IRoomControllerV2Control],
    [ControlType.AudioZone, AudioZoneControl],
    [ControlType.AudioZoneV2, AudioZoneV2Control],
    [ControlType.CentralAudioZone, CentralAudioZoneControl],
    [ControlType.CentralGate, CentralGateControl],
    [ControlType.CentralJalousie, CentralJalousieControl],
    [ControlType.CentralWindow, CentralWindowControl],
    [ControlType.TextState, TextStateControl],
    [ControlType.IntercomV2, IntercomV2Control],
    [ControlType.Sauna, SaunaControl],
    [ControlType.EnergyManager2, EnergyManager2Control],
    [ControlType.EnergyFlowMonitor, EnergyFlowMonitorControl],
    [ControlType.TimedSwitch, TimedSwitchControl],
    [ControlType.PresenceDetector, PresenceDetectorControl],
    [ControlType.WindowMonitor, WindowMonitorControl],
    [ControlType.SmokeAlarm, SmokeAlarmControl],
    [ControlType.Hourcounter, HourcounterControl],
    [ControlType.InfoOnlyText, InfoOnlyTextControl],
    [ControlType.ValueSelector, ValueSelectorControl],
    [ControlType.UpDownAnalog, ValueSelectorControl],
    [ControlType.LeftRightAnalog, ValueSelectorControl],
    [ControlType.UpDownLeftRightAnalog, ValueSelectorControl],
    [ControlType.Fronius, FroniusControl],
    [ControlType.Tracker, TrackerControl],
    [ControlType.Daytimer, DaytimerControl],
    [ControlType.AlarmClock, AlarmClockControl],
    [ControlType.Intercom, IntercomControl],
    [ControlType.MailBox, MailBoxControl],
    [ControlType.Ventilation, VentilationControl],
    [ControlType.LoadManager, LoadManagerControl],
    [ControlType.AalSmartAlarm, AalControl],
    [ControlType.AalEmergency, AalControl],
  ]);

  // Backward compatibility aliases
  private static readonly typeAliases: Record<string, ControlType> = {
    'EFM': ControlType.EnergyFlowMonitor,
    'TextInput': ControlType.TextState,
    'Webpage': ControlType.TextState,
  };

  /**
   * Map control type string from Loxone to ControlType enum
   * @param typeString The control type string from Loxone
   * @returns The mapped ControlType enum value
   */
  static mapControlType(typeString: string): ControlType {
    // Check for aliases first
    if (this.typeAliases[typeString]) {
      return this.typeAliases[typeString];
    }

    // Direct enum value lookup - the enum value is the same as the string
    const enumValue = ControlType[typeString as keyof typeof ControlType];
    return enumValue || ControlType.Unknown;
  }

  /**
   * Whether the control type has a dedicated implementation. Other types are still
   * exposed read-only through GenericControl.
   */
  static isSupported(control: LoxoneControl): boolean {
    const type = this.mapControlType(control?.type || '');
    return type !== ControlType.Unknown && this.controlTypeMap.has(type);
  }

  static supportedTypes(): ControlType[] {
    return Array.from(this.controlTypeMap.keys());
  }

  /**
   * Create a control instance based on its type
   * @param uuid The control UUID
   * @param control The Loxone control definition
   * @param structure The Loxone structure file
   * @param stateCache The state cache map
   * @returns An instance of the appropriate control type
   */
  static create(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>): AbstractControlType {
    const type = this.mapControlType(control?.type || '');
    // Get the constructor for this control type
    const ControlClass = this.controlTypeMap.get(type);
    if (ControlClass) {
      return new ControlClass(uuid, control, structure, stateCache);
    }
    // Return generic control for unknown or unimplemented types
    return new GenericControl(uuid, control, type, structure, stateCache);
  }
}