import { describe, it, expect } from '@jest/globals';
import { ControlTypeFactory } from '../../../src/tools/loxone-system/control-types/ControlTypeFactory.js';
import { TimedSwitchControl } from '../../../src/tools/loxone-system/control-types/TimedSwitchControl.js';
import { WindowMonitorControl } from '../../../src/tools/loxone-system/control-types/WindowMonitorControl.js';
import { ValueSelectorControl } from '../../../src/tools/loxone-system/control-types/ValueSelectorControl.js';
import { GenericControl } from '../../../src/tools/loxone-system/control-types/GenericControl.js';
import { createMockStructure } from '../../fixtures/control-mocks.js';
import type { LoxoneControl } from '../../../src/tools/loxone-system/types/control-structure.js';
import type { StateValue } from '../../../src/tools/loxone-system/types/structure.js';

const structure = createMockStructure();

function cache(values: Record<string, unknown>): Map<string, StateValue> {
  return new Map(Object.entries(values).map(([uuid, value]) => [uuid, { uuid, value, lastUpdated: new Date() }]));
}

function control(type: string, states: Record<string, string>, details: Record<string, unknown> = {}): LoxoneControl {
  return { name: `Test ${type}`, type, uuidAction: `${type}-uuid`, room: 'room-uuid-1', cat: 'cat-uuid-1', states, details };
}

describe('TimedSwitchControl', () => {
  const c = control('TimedSwitch', { deactivationDelay: 'delay', deactivationDelayTotal: 'total' });

  it('builds pulse/on/off commands and rejects others', () => {
    const instance = ControlTypeFactory.create('ts', c, structure, cache({}));
    expect(instance).toBeInstanceOf(TimedSwitchControl);
    expect(instance.buildControlCommand('pulse')).toBe('jdev/sps/io/ts/pulse');
    expect(instance.buildControlCommand('on')).toBe('jdev/sps/io/ts/on');
    expect(() => instance.buildControlCommand('toggle')).toThrow(/Invalid command/);
    expect(instance.availableControlCommands().map(x => x.name)).toEqual(['pulse', 'on', 'off']);
  });

  it('summarises remaining time, permanent on and off', () => {
    expect(ControlTypeFactory.create('ts', c, structure, cache({ delay: 90, total: 300 })).generateSummary()).toBe('Timed switch ON (1m 30s remaining of 5m 00s)');
    expect(ControlTypeFactory.create('ts', c, structure, cache({ delay: -1 })).generateSummary()).toBe('Timed switch ON (permanent)');
    expect(ControlTypeFactory.create('ts', c, structure, cache({ delay: 0, total: 300 })).generateSummary()).toBe('Timed switch OFF (timer duration 5m 00s)');
  });
});

describe('WindowMonitorControl', () => {
  const c = control('WindowMonitor',
    { numOpen: 'open', numClosed: 'closed', numTilted: 'tilted', numOffline: 'offline', windowStates: 'ws' },
    { windows: [{ name: 'Kitchen window' }, { name: 'Front door' }, { name: 'Bedroom window' }] });

  it('is read-only and names the windows that are not closed', () => {
    const instance = ControlTypeFactory.create('wm', c, structure, cache({ open: 1, closed: 1, tilted: 1, offline: 0, ws: '4,1,2' }));
    expect(instance).toBeInstanceOf(WindowMonitorControl);
    expect(instance.availableControlCommands()).toEqual([]);
    expect(() => instance.buildControlCommand('open')).toThrow(/read-only/);
    expect(instance.generateSummary()).toBe('Windows/doors: 1 open, 1 tilted, 1 closed (Kitchen window: open, Bedroom window: tilted)');
    const states = instance.toJSON().currentStates as Record<string, { value: unknown }>;
    expect(states.windowStates.value).toEqual([
      { name: 'Kitchen window', state: 'open' },
      { name: 'Front door', state: 'closed' },
      { name: 'Bedroom window', state: 'tilted' },
    ]);
  });
});

describe('ValueSelectorControl', () => {
  const c = control('ValueSelector', { value: 'v', min: 'min', max: 'max', step: 'step' }, { format: '%.0f%%' });

  it('sends the numeric value and validates the range', () => {
    const instance = ControlTypeFactory.create('vs', c, structure, cache({ v: 40, min: 0, max: 100, step: 5 }));
    expect(instance).toBeInstanceOf(ValueSelectorControl);
    expect(instance.buildControlCommand('setValue', 55)).toBe('jdev/sps/io/vs/55');
    expect(instance.buildControlCommand('setValue', '20')).toBe('jdev/sps/io/vs/20');
    expect(() => instance.buildControlCommand('setValue', 150)).toThrow(/outside the allowed range 0..100/);
    expect(() => instance.buildControlCommand('setValue', 'abc')).toThrow(/numeric/);
    expect(instance.availableControlCommands()[0]).toMatchObject({ name: 'setValue', min: 0, max: 100, step: 5 });
    expect(instance.generateSummary()).toBe('ValueSelector 40%, range 0..100');
  });

  it('handles the analog up/down block types', () => {
    const instance = ControlTypeFactory.create('ud', control('UpDownAnalog', { value: 'v' }), structure, cache({ v: 3 }));
    expect(instance).toBeInstanceOf(ValueSelectorControl);
    expect(instance.getType()).toBe('UpDownAnalog');
  });
});

describe('ControlTypeFactory coverage of new types', () => {
  it.each([
    ['PresenceDetector', { active: 'a', events: 'e' }, { a: 1, e: 12 }, 'Presence detected, 12 events'],
    ['SmokeAlarm', { level: 'l', alarmCause: 'c', acousticAlarm: 'ac' }, { l: 2, c: 1, ac: 1 }, 'Smoke alarm: ALARM ACTIVE (acoustic, cause: smoke, siren on)'],
    ['SmokeAlarm', { level: 'l' }, { l: 0 }, 'Smoke alarm: no alarm'],
    ['Hourcounter', { active: 'a', total: 't', remaining: 'r', overdue: 'o' }, { a: 1, t: 7200, r: 600, o: 0 }, 'Hour counter (running, total 2h 00m, maintenance due in 10m 00s)'],
    ['InfoOnlyText', { text: 't' }, { t: 'Door open' }, 'Info (Door open)'],
    ['Tracker', { entries: 'e' }, { e: 'Second|First' }, 'Tracker (2 entries, latest: Second)'],
    ['Fronius', { prodCurr: 'p', consCurr: 'c', gridCurr: 'g', online: 'o' }, { p: 3.5, c: 1.2, g: -2.3, o: 1 }, 'Energy monitor (producing 3.50 kW, consuming 1.20 kW, exporting 2.30 kW)'],
    ['AlarmClock', { isEnabled: 'e', isAlarmActive: 'a' }, { e: 1, a: 1 }, 'Alarm clock RINGING'],
    ['MailBox', { packetReceived: 'p', mailReceived: 'm' }, { p: 1, m: 0 }, 'Mailbox (parcel waiting)'],
    ['Ventilation', { speed: 's', temperatureIndoor: 't', humidityIndoor: 'h' }, { s: 45, t: 21.4, h: 48 }, 'Ventilation (fan 45%, indoor 21.4°C, 48% RH)'],
    ['LoadManager', { currentPower: 'c', maxPower: 'm', maxPowerExceeded: 'x' }, { c: 4.2, m: 11, x: 1 }, 'Load manager (4.20 kW of 11.00 kW, LIMIT EXCEEDED)'],
    ['AalEmergency', { status: 's' }, { s: 1 }, 'Emergency button: ALARM'],
  ])('%s produces a readable summary', (type, states, values, expected) => {
    const instance = ControlTypeFactory.create(`${type}-uuid`, control(type, states as Record<string, string>), structure, cache(values as Record<string, unknown>));
    expect(instance).not.toBeInstanceOf(GenericControl);
    expect(instance.generateSummary()).toBe(expected);
  });

  it('exposes commands only where verified', () => {
    const names = (type: string, states: Record<string, string> = {}) =>
      ControlTypeFactory.create('x', control(type, states), structure, cache({})).availableControlCommands().map(c => c.name);
    expect(names('SmokeAlarm')).toEqual(['mute', 'quit']);
    expect(names('AlarmClock')).toEqual(['snooze', 'dismiss']);
    expect(names('MailBox')).toEqual(['confirmPacket', 'confirmMail']);
    expect(names('Intercom')).toEqual(['answer']);
    expect(names('Ventilation')).toEqual([]);
    expect(names('AalSmartAlarm')).toEqual([]);
    expect(names('Daytimer')).toEqual([]);
  });

  it('falls back to GenericControl for Loxone types without a dedicated class', () => {
    const instance = ControlTypeFactory.create('x', control('Irrigation', { active: 'a' }), structure, cache({ a: 1 }));
    expect(instance).toBeInstanceOf(GenericControl);
    expect(instance.getType()).toBe('Irrigation');
    expect(instance.availableControlCommands()).toEqual([]);
    expect(ControlTypeFactory.isSupported(control('Irrigation', {}))).toBe(false);
    expect(ControlTypeFactory.isSupported(control('TimedSwitch', {}))).toBe(true);
  });
});
