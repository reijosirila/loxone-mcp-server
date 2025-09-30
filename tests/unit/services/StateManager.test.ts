import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import 'reflect-metadata';
import { StateManager } from '../../../src/tools/loxone-system/services/StateManager.js';
import { Logger } from '../../../src/utils/Logger.js';
import type { StateValue } from '../../../src/tools/loxone-system/types/structure.js';

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockLogger: jest.Mocked<Logger>;
  let mockDate: Date;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    } as any;

    // Mock Date for consistent testing
    mockDate = new Date('2023-01-01T12:00:00.000Z');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

    stateManager = new StateManager(mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty state cache', () => {
      expect(stateManager.size).toBe(0);
    });
  });

  describe('set and get operations', () => {
    it('should set and retrieve a state value', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const stateValue: StateValue = {
        uuid,
        value: 42,
        lastUpdated: new Date()
      };

      stateManager.set(uuid, stateValue);
      const retrieved = stateManager.get(uuid);

      expect(retrieved).toEqual(stateValue);
      expect(stateManager.size).toBe(1);
    });

    it('should return undefined for non-existent state', () => {
      const retrieved = stateManager.get('non-existent-uuid');
      expect(retrieved).toBeUndefined();
    });

    it('should overwrite existing state with new value', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const firstState: StateValue = {
        uuid,
        value: 42,
        lastUpdated: new Date()
      };
      const secondState: StateValue = {
        uuid,
        value: 84,
        lastUpdated: new Date()
      };

      stateManager.set(uuid, firstState);
      stateManager.set(uuid, secondState);

      const retrieved = stateManager.get(uuid);
      expect(retrieved).toEqual(secondState);
      expect(stateManager.size).toBe(1);
    });
  });

  describe('updateValue', () => {
    it('should update value with current timestamp', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const value = 'test value';

      stateManager.updateValue(uuid, value);

      const retrieved = stateManager.get(uuid);
      expect(retrieved).toEqual({
        uuid,
        value,
        lastUpdated: mockDate
      });
    });

    it('should handle numeric values', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const value = 123.45;

      stateManager.updateValue(uuid, value);

      const retrieved = stateManager.get(uuid);
      expect(retrieved?.value).toBe(value);
    });

    it('should handle boolean values', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const value = true;

      stateManager.updateValue(uuid, value);

      const retrieved = stateManager.get(uuid);
      expect(retrieved?.value).toBe(value);
    });

    it('should handle null values', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const value = null;

      stateManager.updateValue(uuid, value);

      const retrieved = stateManager.get(uuid);
      expect(retrieved?.value).toBe(value);
    });

    it('should update existing state with new value', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';

      stateManager.updateValue(uuid, 'initial value');
      stateManager.updateValue(uuid, 'updated value');

      const retrieved = stateManager.get(uuid);
      expect(retrieved?.value).toBe('updated value');
      expect(stateManager.size).toBe(1);
    });
  });

  describe('getValue', () => {
    it('should return the raw value without StateValue wrapper', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const value = 'raw value';

      stateManager.updateValue(uuid, value);

      expect(stateManager.getValue(uuid)).toBe(value);
    });

    it('should return undefined for non-existent state', () => {
      expect(stateManager.getValue('non-existent-uuid')).toBeUndefined();
    });

    it('should return the value even if it is falsy', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';

      stateManager.updateValue(uuid, 0);
      expect(stateManager.getValue(uuid)).toBe(0);

      stateManager.updateValue(uuid, '');
      expect(stateManager.getValue(uuid)).toBe('');

      stateManager.updateValue(uuid, false);
      expect(stateManager.getValue(uuid)).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing state and return true', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      stateManager.updateValue(uuid, 'test');

      const deleted = stateManager.delete(uuid);

      expect(deleted).toBe(true);
      expect(stateManager.get(uuid)).toBeUndefined();
      expect(stateManager.size).toBe(0);
    });

    it('should return false when deleting non-existent state', () => {
      const deleted = stateManager.delete('non-existent-uuid');
      expect(deleted).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing states', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      stateManager.updateValue(uuid, 'test');

      expect(stateManager.has(uuid)).toBe(true);
    });

    it('should return false for non-existent states', () => {
      expect(stateManager.has('non-existent-uuid')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all states', () => {
      stateManager.updateValue('uuid1', 'value1');
      stateManager.updateValue('uuid2', 'value2');
      stateManager.updateValue('uuid3', 'value3');

      expect(stateManager.size).toBe(3);

      stateManager.clear();

      expect(stateManager.size).toBe(0);
      expect(stateManager.get('uuid1')).toBeUndefined();
      expect(stateManager.get('uuid2')).toBeUndefined();
      expect(stateManager.get('uuid3')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return a copy of all states', () => {
      const uuid1 = '1234abcd-5678-90ef-1234-567890abcdef';
      const uuid2 = '2345bcde-6789-01fa-2345-678901bcdefg';

      stateManager.updateValue(uuid1, 'value1');
      stateManager.updateValue(uuid2, 'value2');

      const allStates = stateManager.getAll();

      expect(allStates.size).toBe(2);
      expect(allStates.get(uuid1)?.value).toBe('value1');
      expect(allStates.get(uuid2)?.value).toBe('value2');
    });

    it('should return a copy that does not affect internal state when modified', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      stateManager.updateValue(uuid, 'original');

      const allStates = stateManager.getAll();
      allStates.delete(uuid);

      // Original state should still exist
      expect(stateManager.has(uuid)).toBe(true);
      expect(stateManager.getValue(uuid)).toBe('original');
    });

    it('should return empty map when no states exist', () => {
      const allStates = stateManager.getAll();
      expect(allStates.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct size as states are added and removed', () => {
      expect(stateManager.size).toBe(0);

      stateManager.updateValue('uuid1', 'value1');
      expect(stateManager.size).toBe(1);

      stateManager.updateValue('uuid2', 'value2');
      expect(stateManager.size).toBe(2);

      stateManager.updateValue('uuid1', 'updated value'); // Update existing
      expect(stateManager.size).toBe(2);

      stateManager.delete('uuid1');
      expect(stateManager.size).toBe(1);

      stateManager.clear();
      expect(stateManager.size).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all states and log debug message', () => {
      stateManager.updateValue('uuid1', 'value1');
      stateManager.updateValue('uuid2', 'value2');

      expect(stateManager.size).toBe(2);

      stateManager.cleanup();

      expect(stateManager.size).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith('StateManager', 'Cleanup complete');
    });
  });

  describe('edge cases', () => {
    it('should handle large number of states', () => {
      const numStates = 1000;

      // Add many states
      for (let i = 0; i < numStates; i++) {
        stateManager.updateValue(`uuid-${i}`, `value-${i}`);
      }

      expect(stateManager.size).toBe(numStates);

      // Verify random states
      expect(stateManager.getValue('uuid-500')).toBe('value-500');
      expect(stateManager.getValue('uuid-999')).toBe('value-999');
    });

    it('should handle complex object values', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';
      const complexValue = {
        nested: {
          property: 'test',
          array: [1, 2, 3],
          bool: true
        }
      };

      stateManager.updateValue(uuid, complexValue);

      expect(stateManager.getValue(uuid)).toEqual(complexValue);
    });

    it('should handle undefined values in updateValue', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';

      stateManager.updateValue(uuid, undefined);

      const retrieved = stateManager.get(uuid);
      expect(retrieved?.value).toBeUndefined();
      expect(retrieved?.uuid).toBe(uuid);
      expect(retrieved?.lastUpdated).toEqual(mockDate);
    });

    it('should maintain state consistency with concurrent operations', () => {
      const uuid = '1234abcd-5678-90ef-1234-567890abcdef';

      // Simulate concurrent operations
      stateManager.updateValue(uuid, 'value1');
      stateManager.set(uuid, {
        uuid,
        value: 'value2',
        lastUpdated: new Date('2023-01-01T13:00:00.000Z')
      });
      stateManager.updateValue(uuid, 'value3');

      // Last updateValue should win
      expect(stateManager.getValue(uuid)).toBe('value3');
      expect(stateManager.get(uuid)?.lastUpdated).toEqual(mockDate);
    });
  });
});