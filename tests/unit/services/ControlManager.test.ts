import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import 'reflect-metadata';
import { ControlManager } from '../../../src/tools/loxone-system/services/ControlManager.js';
import { ConnectionManager } from '../../../src/tools/loxone-system/services/ConnectionManager.js';
import { StateManager } from '../../../src/tools/loxone-system/services/StateManager.js';
import { Logger } from '../../../src/utils/Logger.js';
import { type StructureFile } from '../../../src/tools/loxone-system/types/structure.js';
import { createMockStructure, mockStateCache } from '../../../tests/fixtures/control-mocks.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the control type imports
jest.mock('../../../src/tools/loxone-system/control-types/SwitchControl.js');
jest.mock('../../../src/tools/loxone-system/control-types/DimmerControl.js');
jest.mock('../../../src/tools/loxone-system/control-types/MeterControl.js');

describe('ControlManager', () => {
  let controlManager: ControlManager;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockStructure: StructureFile;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mocks
    mockConnectionManager = {
      sendCommand: jest.fn(),
      isConnected: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    } as any;
    
    mockStateManager = {
      getState: jest.fn(),
      setState: jest.fn(),
      getAll: jest.fn().mockReturnValue(mockStateCache),
      on: jest.fn()
    } as any;
    
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    } as any;
    
    mockStructure = createMockStructure() as any;
    
    // Create instance
    controlManager = new ControlManager(
      mockConnectionManager,
      mockStateManager,
      mockLogger
    );
  });

  describe('updateStructure', () => {
    it('should update structure', () => {
      controlManager.updateStructure(mockStructure);
      
      // Test that structure is updated by trying to get rooms
      const rooms = controlManager.getRooms();
      expect(rooms).toHaveLength(2);
    });

    it('should handle null structure', () => {
      controlManager.updateStructure(null);
      
      const rooms = controlManager.getRooms();
      expect(rooms).toEqual([]);
    });
  });

  describe('getRooms', () => {
    beforeEach(() => {
      controlManager.updateStructure(mockStructure);
    });

    it('should return all rooms', () => {
      const rooms = controlManager.getRooms();
      
      expect(rooms).toEqual([
        { uuid: 'room-uuid-1', name: 'Living Room' },
        { uuid: 'room-uuid-2', name: 'Kitchen' }
      ]);
    });

    it('should return empty array when no structure', () => {
      controlManager.updateStructure(null);
      
      const rooms = controlManager.getRooms();
      expect(rooms).toEqual([]);
    });
  });

  describe('getCategories', () => {
    beforeEach(() => {
      controlManager.updateStructure(mockStructure);
    });

    it('should return all categories', () => {
      const categories = controlManager.getCategories();
      
      expect(categories).toEqual([
        { uuid: 'cat-uuid-1', name: 'Lights', type: 'lights' },
        { uuid: 'cat-uuid-2', name: 'Dimmers', type: 'lights' },
        { uuid: 'cat-uuid-3', name: 'Energy', type: 'undefined' }
      ]);
    });

    it('should return empty array when no structure', () => {
      controlManager.updateStructure(null);
      
      const categories = controlManager.getCategories();
      expect(categories).toEqual([]);
    });
  });

  describe('getControls', () => {
    beforeEach(() => {
      controlManager.updateStructure(mockStructure);
    });

    it('should return all controls when no filters', () => {
      const controls = controlManager.getControls();
      
      expect(controls).toHaveLength(3);
      expect(mockLogger.debug).toHaveBeenCalledWith('ControlManager', 'Getting controls');
    });

    it('should filter controls by room', () => {
      const controls = controlManager.getControls('room-uuid-1', null);
      
      expect(controls).toHaveLength(2); // Switch and Dimmer are in room-uuid-1
    });

    it('should filter controls by category', () => {
      const controls = controlManager.getControls(null, 'cat-uuid-1');
      
      expect(controls).toHaveLength(1); // Only Switch is in cat-uuid-1
    });

    it('should filter controls by both room and category', () => {
      const controls = controlManager.getControls('room-uuid-1', 'cat-uuid-2');
      
      expect(controls).toHaveLength(1); // Only Dimmer matches both filters
    });

    it('should return empty array when no structure', () => {
      controlManager.updateStructure(null);
      
      const controls = controlManager.getControls();
      expect(controls).toEqual([]);
    });

    it('should skip unsupported control types', () => {
      // Add an unsupported control type to the structure
      const structureWithUnsupported = {
        ...mockStructure,
        controls: {
          ...mockStructure.controls,
          'unsupported-uuid': {
            name: 'Unsupported Control',
            type: 'EFM', // Unsupported type
            room: 'room-uuid-1',
            cat: 'cat-uuid-1'
          }
        }
      } as any;
      
      controlManager.updateStructure(structureWithUnsupported);
      const controls = controlManager.getControls();
      
      // Should still have 3 controls (unsupported one is filtered out)
      expect(controls).toHaveLength(3);
    });
  });

  describe('getControl', () => {
    beforeEach(() => {
      controlManager.updateStructure(mockStructure);
    });

    it('should return control by UUID', () => {
      const control = controlManager.getControl('1234abcd-5678-90ef-1234-567890abcdef');
      
      expect(control).toBeDefined();
      // The actual control properties depend on the control type implementation
    });

    it('should throw error when structure not loaded', () => {
      controlManager.updateStructure(null);
      
      expect(() => controlManager.getControl('1234abcd-5678-90ef-1234-567890abcdef'))
        .toThrow(McpError);
    });

    it('should throw error when control not found', () => {
      expect(() => controlManager.getControl('non-existent-uuid'))
        .toThrow('Control non-existent-uuid not found');
    });
  });

  describe('command execution', () => {
    beforeEach(() => {
      controlManager.updateStructure(mockStructure);
      mockConnectionManager.sendCommand.mockResolvedValue({ 
        code: 200,
      });
    });

    describe('setControl', () => {
      it('should send control command', async () => {
        mockConnectionManager.isConnected.mockReturnValue(true);
        
        const result = await controlManager.setControl('1234abcd-5678-90ef-1234-567890abcdef', 'on');
        
        expect(result).toBe(true);
        expect(mockConnectionManager.sendCommand).toHaveBeenCalled();
      });

      it('should handle invalid UUID', async () => {
        mockConnectionManager.isConnected.mockReturnValue(true);
        
        await expect(controlManager.setControl('invalid-uuid', 'on'))
          .rejects.toThrow('Control invalid-uuid not found');
      });
      
      it('should throw when not connected', async () => {
        mockConnectionManager.isConnected.mockReturnValue(false);
        
        await expect(controlManager.setControl('1234abcd-5678-90ef-1234-567890abcdef', 'on'))
          .rejects.toThrow('Not connected to Loxone');
      });
    });
  });

});