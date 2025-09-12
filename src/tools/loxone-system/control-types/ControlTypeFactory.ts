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

export class ControlTypeFactory {
  private static typeMap: { [key: string]: ControlType } = {
    'Switch': ControlType.Switch,
    'Dimmer': ControlType.Dimmer,
    'Jalousie': ControlType.Jalousie,
    'Gate': ControlType.Gate,
    'DigitalInput': ControlType.DigitalInput,
    'Pushbutton': ControlType.Pushbutton,
    'Slider': ControlType.Slider,
    'Intercom': ControlType.Intercom,
    'IRoomControllerV2': ControlType.IRoomControllerV2,
    'IRoomController': ControlType.IRoomController,
    'Sauna': ControlType.Sauna,
    'Alarm': ControlType.Alarm,
    'CentralAlarm': ControlType.CentralAlarm,
    'AudioZone': ControlType.AudioZone,
    'ColorPicker': ControlType.ColorPicker,
    'ColorPickerV2': ControlType.ColorPickerV2,
    'LightController': ControlType.LightController,
    'InfoOnlyDigital': ControlType.InfoOnlyDigital,
    'InfoOnlyAnalog': ControlType.InfoOnlyAnalog,
    'TextInput': ControlType.TextInput,
    'Webpage': ControlType.Webpage,
    'EIBDimmer': ControlType.EIBDimmer,
    'LightControllerV2': ControlType.LightControllerV2,
    'Radio': ControlType.Radio,
    'TextState': ControlType.TextState,
    'AudioZoneV2': ControlType.AudioZoneV2,
    'CentralAudioZone': ControlType.CentralAudioZone,
    'EFM': ControlType.EFM,
    'Meter': ControlType.Meter,
    'SpotPriceOptimizer': ControlType.SpotPriceOptimizer
  };
  
  static mapControlType(typeString: string): ControlType {
    return this.typeMap[typeString] || ControlType.Unknown;
  }
  
  static create(uuid: string, control: LoxoneControl, structure: LoxoneStructureFile, stateCache: Map<string, StateValue>): AbstractControlType {
    const type = this.mapControlType(control?.type || '');
    let instance: AbstractControlType;
    
    switch (type) {
      case ControlType.Switch:
        instance = new SwitchControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Dimmer:
        instance = new DimmerControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.EIBDimmer:
        instance = new EIBDimmerControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.ColorPicker:
        instance = new ColorPickerControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.ColorPickerV2:
        instance = new ColorPickerV2Control(uuid, control, structure, stateCache);
        break;
      
      case ControlType.LightController:
        instance = new LightController(uuid, control, structure, stateCache);
        break;
      
      case ControlType.LightControllerV2:
        instance = new LightControllerV2Control(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Jalousie:
        instance = new JalousieControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Gate:
        instance = new GateControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Slider:
        instance = new SliderControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Pushbutton:
        instance = new PushbuttonControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Alarm:
        instance = new AlarmControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.CentralAlarm:
        instance = new CentralAlarmControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Meter:
        instance = new MeterControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.InfoOnlyDigital:
      case ControlType.DigitalInput:
        instance = new InfoOnlyDigitalControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.InfoOnlyAnalog:
        instance = new InfoOnlyAnalogControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.Radio:
        instance = new RadioControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.IRoomControllerV2:
      case ControlType.IRoomController:
        instance = new IRoomControllerV2Control(uuid, control, structure, stateCache);
        break;
      
      case ControlType.AudioZone:
        instance = new AudioZoneControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.AudioZoneV2:
        instance = new AudioZoneV2Control(uuid, control, structure, stateCache);
        break;
      
      case ControlType.CentralAudioZone:
        instance = new CentralAudioZoneControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.CentralGate:
        instance = new CentralGateControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.CentralJalousie:
        instance = new CentralJalousieControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.CentralWindow:
        instance = new CentralWindowControl(uuid, control, structure, stateCache);
        break;
      
      case ControlType.TextState:
        instance = new TextStateControl(uuid, control, structure, stateCache);
        break;
      
      default:
        // Return generic control for unknown or unimplemented types
        instance = new GenericControl(uuid, control, type, structure, stateCache);
        break;
    }
    
    return instance;
  }
}