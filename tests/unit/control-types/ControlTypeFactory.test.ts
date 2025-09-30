import { describe, it, expect, jest } from '@jest/globals';
import { ControlTypeFactory } from '../../../src/tools/loxone-system/control-types/ControlTypeFactory.js';
import { ControlType } from '../../../src/tools/loxone-system/types/structure.js';
import { SwitchControl } from '../../../src/tools/loxone-system/control-types/SwitchControl.js';
import { DimmerControl } from '../../../src/tools/loxone-system/control-types/DimmerControl.js';
import { MeterControl } from '../../../src/tools/loxone-system/control-types/MeterControl.js';
import { GenericControl } from '../../../src/tools/loxone-system/control-types/GenericControl.js';
import { 
  mockSwitchControl, 
  mockDimmerControl,
  mockMeterControl,
  mockStateCache,
  createMockStructure
} from '../../fixtures/control-mocks.js';


describe('ControlTypeFactory', () => {
  const mockStructure = createMockStructure();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mapControlType', () => {
    it('should map known control types correctly', () => {
      expect(ControlTypeFactory.mapControlType('Switch')).toBe(ControlType.Switch);
      expect(ControlTypeFactory.mapControlType('Dimmer')).toBe(ControlType.Dimmer);
      expect(ControlTypeFactory.mapControlType('Jalousie')).toBe(ControlType.Jalousie);
      expect(ControlTypeFactory.mapControlType('Gate')).toBe(ControlType.Gate);
      expect(ControlTypeFactory.mapControlType('Meter')).toBe(ControlType.Meter);
      expect(ControlTypeFactory.mapControlType('AudioZone')).toBe(ControlType.AudioZone);
      expect(ControlTypeFactory.mapControlType('ColorPicker')).toBe(ControlType.ColorPicker);
      expect(ControlTypeFactory.mapControlType('ColorPickerV2')).toBe(ControlType.ColorPickerV2);
      expect(ControlTypeFactory.mapControlType('LightController')).toBe(ControlType.LightController);
      expect(ControlTypeFactory.mapControlType('LightControllerV2')).toBe(ControlType.LightControllerV2);
      expect(ControlTypeFactory.mapControlType('IRoomControllerV2')).toBe(ControlType.IRoomControllerV2);
    });

    it('should return Unknown for unmapped types', () => {
      expect(ControlTypeFactory.mapControlType('UnknownType')).toBe(ControlType.Unknown);
      expect(ControlTypeFactory.mapControlType('RandomControl')).toBe(ControlType.Unknown);
      expect(ControlTypeFactory.mapControlType('')).toBe(ControlType.Unknown);
    });

    it('should handle all control types in the map', () => {
      const expectedMappings = [
        ['Switch', ControlType.Switch],
        ['Dimmer', ControlType.Dimmer],
        ['EIBDimmer', ControlType.EIBDimmer],
        ['Jalousie', ControlType.Jalousie],
        ['Gate', ControlType.Gate],
        ['DigitalInput', ControlType.DigitalInput],
        ['Pushbutton', ControlType.Pushbutton],
        ['Slider', ControlType.Slider],
        ['Intercom', ControlType.Intercom],
        ['IRoomControllerV2', ControlType.IRoomControllerV2],
        ['IRoomController', ControlType.IRoomController],
        ['Sauna', ControlType.Sauna],
        ['Alarm', ControlType.Alarm],
        ['CentralAlarm', ControlType.CentralAlarm],
        ['AudioZone', ControlType.AudioZone],
        ['AudioZoneV2', ControlType.AudioZoneV2],
        ['CentralAudioZone', ControlType.CentralAudioZone],
        ['ColorPicker', ControlType.ColorPicker],
        ['ColorPickerV2', ControlType.ColorPickerV2],
        ['LightController', ControlType.LightController],
        ['LightControllerV2', ControlType.LightControllerV2],
        ['InfoOnlyDigital', ControlType.InfoOnlyDigital],
        ['InfoOnlyAnalog', ControlType.InfoOnlyAnalog],
        ['TextInput', ControlType.TextState],  // TextInput is an alias for TextState
        ['Webpage', ControlType.TextState],    // Webpage is an alias for TextState
        ['Radio', ControlType.Radio],
        ['TextState', ControlType.TextState],
        ['EFM', ControlType.EnergyFlowMonitor],  // EFM is an alias for EnergyFlowMonitor
        ['Meter', ControlType.Meter],
        ['SpotPriceOptimizer', ControlType.SpotPriceOptimizer]
      ];

      for (const [typeString, expectedType] of expectedMappings) {
        expect(ControlTypeFactory.mapControlType(typeString as string))
          .toBe(expectedType);
      }
    });
  });

  describe('create', () => {
    it('should create correct control type instances', () => {
      // Test Switch
      const switchInstance = ControlTypeFactory.create(
        '1234abcd-5678-90ef-1234-567890abcdef',
        mockSwitchControl,
        mockStructure,
        mockStateCache
      );
      expect(switchInstance).toBeInstanceOf(SwitchControl);

      // Test Dimmer
      const dimmerInstance = ControlTypeFactory.create(
        '2345bcde-6789-01fa-2345-678901bcdefg',
        mockDimmerControl,
        mockStructure,
        mockStateCache
      );
      expect(dimmerInstance).toBeInstanceOf(DimmerControl);

      // Test Meter
      const meterInstance = ControlTypeFactory.create(
        '3456cdef-7890-12ab-3456-789012cdefgh',
        mockMeterControl,
        mockStructure,
        mockStateCache
      );
      expect(meterInstance).toBeInstanceOf(MeterControl);
    });

    it('should create GenericControl for unknown types', () => {
      const unknownControl = {
        ...mockSwitchControl,
        type: 'UnknownType'
      };
      
      const instance = ControlTypeFactory.create(
        'unknown-uuid',
        unknownControl,
        mockStructure,
        mockStateCache
      );
      
      expect(instance).toBeInstanceOf(GenericControl);
    });
  });

  describe('error handling', () => {
    it('should handle control without type', () => {
      const controlWithoutType: any = {
        name: 'Test',
        // type is missing
      };
      
      const instance = ControlTypeFactory.create('uuid', controlWithoutType, mockStructure, mockStateCache);
      expect(instance).toBeInstanceOf(GenericControl);
    });
  });
});