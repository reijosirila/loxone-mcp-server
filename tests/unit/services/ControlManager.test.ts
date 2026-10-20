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
      expect(mockLogger.debug).toHaveBeenCalledWith('ControlManager', 'Getting controls', expect.anything());
    });

    it('should filter controls by room uuid', () => {
      const controls = controlManager.getControls({ room: 'room-uuid-1' });
      
      expect(controls).toHaveLength(2); // Switch and Dimmer are in room-uuid-1
    });

    it('should filter controls by room name, case-insensitively', () => {
      expect(controlManager.getControls({ room: 'living room' })).toHaveLength(2);
      expect(controlManager.getControls({ room: 'Kitchen' })).toHaveLength(1);
    });

    it('should filter controls by category uuid or name', () => {
      expect(controlManager.getControls({ category: 'cat-uuid-1' })).toHaveLength(1);
      expect(controlManager.getControls({ category: 'energy' })).toHaveLength(1);
    });

    it('should filter controls by both room and category', () => {
      const controls = controlManager.getControls({ room: 'room-uuid-1', category: 'cat-uuid-2' });
      
      expect(controls).toHaveLength(1); // Only Dimmer matches both filters
    });

    it('should filter controls by type and search text', () => {
      expect(controlManager.getControls({ type: 'switch' })).toHaveLength(1);
      expect(controlManager.getControls({ search: 'meter' })).toHaveLength(1);
      expect(controlManager.getControls({ search: 'does-not-exist' })).toHaveLength(0);
    });

    it('should reject unknown rooms with the list of available rooms', () => {
      expect(() => controlManager.getControls({ room: 'Garage' })).toThrow(McpError);
      expect(() => controlManager.getControls({ room: 'Garage' })).toThrow(/Available rooms: Kitchen, Living Room/);
    });

    it('should return empty array when no structure', () => {
      controlManager.updateStructure(null);
      
      const controls = controlManager.getControls();
      expect(controls).toEqual([]);
    });

    it('should expose control types without a dedicated class as generic controls', () => {
      const structureWithUnsupported = {
        ...mockStructure,
        controls: {
          ...mockStructure.controls,
          'unsupported-uuid': {
            name: 'Pool',
            type: 'PoolController',
            uuidAction: 'unsupported-uuid',
            room: 'room-uuid-1',
            cat: 'cat-uuid-1'
          }
        }
      } as any;
      
      controlManager.updateStructure(structureWithUnsupported);
      const controls = controlManager.getControls();
      
      expect(controls).toHaveLength(4);
      expect(controlManager.getControls({ type: 'PoolController' })[0].availableControlCommands()).toEqual([]);
    });

    it('should skip malformed controls without uuidAction', () => {
      const structure = {
        ...mockStructure,
        controls: {
          ...mockStructure.controls,
          'broken-uuid': { name: 'Broken', type: 'Switch' }
        }
      } as any;
      controlManager.updateStructure(structure);

      expect(controlManager.getControls()).toHaveLength(3);
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
      it('should send control command and return the Miniserver response', async () => {
        mockConnectionManager.isConnected.mockReturnValue(true);
        mockConnectionManager.sendCommand.mockResolvedValue({ code: 200, value: '1' });
        
        const result = await controlManager.setControl('1234abcd-5678-90ef-1234-567890abcdef', 'on');
        
        expect(result.code).toBe(200);
        expect(result.value).toBe('1');
        expect(mockConnectionManager.sendCommand).toHaveBeenCalledTimes(1);
      });

      it('should throw a descriptive error when the Miniserver answers with a non-200 code', async () => {
        mockConnectionManager.isConnected.mockReturnValue(true);
        mockConnectionManager.sendCommand.mockResolvedValue({ code: 403, value: undefined });

        await expect(controlManager.setControl('1234abcd-5678-90ef-1234-567890abcdef', 'on'))
          .rejects.toThrow(/code 403.*not allowed/);
      });

      it('should list available commands when the command is invalid', async () => {
        mockConnectionManager.isConnected.mockReturnValue(true);

        await expect(controlManager.setControl('1234abcd-5678-90ef-1234-567890abcdef', 'blink'))
          .rejects.toThrow(/Invalid command blink for Switch. Available commands for .*: on, off/);
        expect(mockConnectionManager.sendCommand).not.toHaveBeenCalled();
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