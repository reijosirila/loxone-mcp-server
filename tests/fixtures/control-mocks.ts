import type { LoxoneControl, LoxoneStructureFile } from '../../src/tools/loxone-system/types/control-structure.js';
import type { StateValue } from '../../src/tools/loxone-system/types/structure.js';

const lastUpdated = new Date();

export const mockStateCache = new Map<string, StateValue>([
  ['1234abcd-5678-90ef-1234-567890abcdef', { uuid: '1234abcd-5678-90ef-1234-567890abcdef', value: 1, lastUpdated }], // Switch on
  ['2345bcde-6789-01fa-2345-678901bcdefg', { uuid: '2345bcde-6789-01fa-2345-678901bcdefg', value: 50, lastUpdated }], // Dimmer at 50%
  ['2345bcde-6789-01fa-2345-678901bcdefg-min', { uuid: '2345bcde-6789-01fa-2345-678901bcdefg-min', value: 0, lastUpdated }],
  ['2345bcde-6789-01fa-2345-678901bcdefg-max', { uuid: '2345bcde-6789-01fa-2345-678901bcdefg-max', value: 100, lastUpdated }],
  ['2345bcde-6789-01fa-2345-678901bcdefg-step', { uuid: '2345bcde-6789-01fa-2345-678901bcdefg-step', value: 1, lastUpdated }],
  ['3456cdef-7890-12ab-3456-789012cdefgh-actual', { uuid: '3456cdef-7890-12ab-3456-789012cdefgh-actual', value: 1.5, lastUpdated }], // 1.5kW current power
  ['3456cdef-7890-12ab-3456-789012cdefgh-total', { uuid: '3456cdef-7890-12ab-3456-789012cdefgh-total', value: 1234.56, lastUpdated }], // Total consumption
]);

export const mockSwitchControl: LoxoneControl = {
  name: 'Test Switch',
  type: 'Switch',
  uuidAction: '1234abcd-5678-90ef-1234-567890abcdef',
  room: 'room-uuid-1',
  cat: 'cat-uuid-1',
  defaultRating: 1,
  isFavorite: false,
  details: {
    format: ''
  },
  states: {
    active: '1234abcd-5678-90ef-1234-567890abcdef'
  }
};

export const mockDimmerControl: LoxoneControl = {
  name: 'Test Dimmer',
  type: 'Dimmer',
  uuidAction: '2345bcde-6789-01fa-2345-678901bcdefg',
  room: 'room-uuid-1',
  cat: 'cat-uuid-2',
  defaultRating: 2,
  isFavorite: true,
  details: {
    format: '%.0f%%',
    min: 0,
    max: 100,
    step: 1
  },
  states: {
    position: '2345bcde-6789-01fa-2345-678901bcdefg',
    min: '2345bcde-6789-01fa-2345-678901bcdefg-min',
    max: '2345bcde-6789-01fa-2345-678901bcdefg-max',
    step: '2345bcde-6789-01fa-2345-678901bcdefg-step'
  }
};

export const mockMeterControl: LoxoneControl = {
  name: 'Test Meter',
  type: 'Meter',
  uuidAction: '3456cdef-7890-12ab-3456-789012cdefgh',
  room: 'room-uuid-2',
  cat: 'cat-uuid-3',
  defaultRating: 0,
  isFavorite: false,
  details: {
    format: '%.2fkWh',
    actualFormat: '%.2fkW',
    totalFormat: '%.2fkWh'
  },
  states: {
    actual: '3456cdef-7890-12ab-3456-789012cdefgh-actual',
    total: '3456cdef-7890-12ab-3456-789012cdefgh-total'
  },
};

export function createMockStructure(): LoxoneStructureFile {
  return {
    controls: {
      '1234abcd-5678-90ef-1234-567890abcdef': mockSwitchControl,
      '2345bcde-6789-01fa-2345-678901bcdefg': mockDimmerControl,
      '3456cdef-7890-12ab-3456-789012cdefgh': mockMeterControl
    },
    rooms: {
      'room-uuid-1': {
        name: 'Living Room',
        uuid: 'room-uuid-1',
        defaultRating: 1
      },
      'room-uuid-2': {
        name: 'Kitchen',
        uuid: 'room-uuid-2',
        defaultRating: 2
      }
    },
    cats: {
      'cat-uuid-1': {
        name: 'Lights',
        uuid: 'cat-uuid-1',
        type: 'lights',
        defaultRating: 1
      },
      'cat-uuid-2': {
        name: 'Dimmers',
        uuid: 'cat-uuid-2',
        type: 'lights',
        defaultRating: 2
      },
      'cat-uuid-3': {
        name: 'Energy',
        uuid: 'cat-uuid-3',
        type: 'undefined',
        defaultRating: 0
      }
    },
    lastModified: '12',
    msInfo: {
      serialNr: '1234567890',
      msName: 'Mock Miniserver',
      projectName: 'Mock Project',
      localUrl: 'http://192.168.1.100',
      remoteUrl: 'https://mock.loxone.cloud',
      tempUnit: 0, // 0 for Celsius
      currency: 'EUR',
      squareMeasure: 'm²',
      location: 'Mock Location',
      latitude: 0,
      longitude: 0,
      altitude: 0,
      weatherServiceUrl: '',
      roomTitle: 'Room',
      catTitle: 'Category',
      currentUser: {
        name: 'mockuser',
        uuid: 'user-mock-uuid',
        isAdmin: true,
        changePassword: false,
        userRights: 1
      }
    },
  };
}