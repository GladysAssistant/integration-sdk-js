const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES, DEVICE_FEATURE_UNITS } = require('../lib/device-constants');

const TYPINGS = readFileSync(path.join(__dirname, '..', 'index.d.ts'), 'utf8');

/**
 * Reads back the `readonly KEY: 'value';` entries a constant is declared with in
 * index.d.ts, as the same shape as the runtime object (one level of nesting for
 * DEVICE_FEATURE_TYPES), so both can be compared key by key.
 */
function parseDeclaration(name) {
  const start = TYPINGS.indexOf(`export declare const ${name}: {`);
  assert.notEqual(start, -1, `${name} is not declared in index.d.ts`);
  const end = TYPINGS.indexOf('\n};', start);
  assert.notEqual(end, -1, `the declaration of ${name} is not terminated in index.d.ts`);

  const declaration = {};
  let group = null;
  for (const line of TYPINGS.slice(start, end).split('\n').slice(1)) {
    const entry = line.match(/^\s+readonly ([A-Z0-9_]+): '(.*)';$/);
    if (entry) {
      (group ?? declaration)[entry[1]] = entry[2];
      continue;
    }
    const groupStart = line.match(/^\s+readonly ([A-Z0-9_]+): \{$/);
    if (groupStart) {
      group = {};
      declaration[groupStart[1]] = group;
    } else if (/^\s+\};$/.test(line)) {
      group = null;
    }
  }
  return declaration;
}

describe('device constants', () => {
  it('should expose the canonical category strings', () => {
    assert.equal(DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR, 'temperature-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR, 'motion-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.SWITCH, 'switch');
    assert.equal(DEVICE_FEATURE_CATEGORIES.LIGHT, 'light');
    assert.equal(DEVICE_FEATURE_CATEGORIES.BATTERY_STORAGE, 'battery-storage');
    assert.equal(DEVICE_FEATURE_CATEGORIES.WATER_VALVE, 'water-valve');
    assert.equal(DEVICE_FEATURE_CATEGORIES.DOORBELL, 'doorbell');
    assert.equal(DEVICE_FEATURE_CATEGORIES.CHARGING_STATION, 'charging-station');
    assert.equal(DEVICE_FEATURE_CATEGORIES.WATER_HEATER, 'water-heater');
    assert.equal(DEVICE_FEATURE_CATEGORIES.GRID_SENSOR, 'grid-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.HOME_OUTPUT_SENSOR, 'home-output-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.MAINTENANCE, 'maintenance');
    assert.equal(DEVICE_FEATURE_CATEGORIES.NO2_SENSOR, 'no2-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.O3_SENSOR, 'o3-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.SO2_SENSOR, 'so2-sensor');
  });

  it('should expose the canonical type strings, grouped by category', () => {
    assert.equal(DEVICE_FEATURE_TYPES.LIGHT.BINARY, 'binary');
    assert.equal(DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS, 'brightness');
    assert.equal(DEVICE_FEATURE_TYPES.SENSOR.DECIMAL, 'decimal');
    assert.equal(DEVICE_FEATURE_TYPES.SWITCH.POWER, 'power');
    assert.equal(DEVICE_FEATURE_TYPES.BATTERY_STORAGE.CHARGE_POWER, 'charge-power');
    assert.equal(DEVICE_FEATURE_TYPES.WATER_VALVE.FLOW, 'flow');
    assert.equal(DEVICE_FEATURE_TYPES.DOORBELL.RING, 'ring');
    assert.equal(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.FAN_SPEED, 'fan-speed');
    assert.equal(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.SWING_HORIZONTAL, 'swing-horizontal');
    assert.equal(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.SWING_VERTICAL, 'swing-vertical');
    assert.equal(DEVICE_FEATURE_TYPES.CHARGING_STATION.CONNECTOR_STATUS, 'connector-status');
    assert.equal(DEVICE_FEATURE_TYPES.CHARGING_STATION.CHARGING_STATE, 'charging-state');
    assert.equal(DEVICE_FEATURE_TYPES.THERMOSTAT.MODE, 'mode');
    assert.equal(DEVICE_FEATURE_TYPES.THERMOSTAT.OPERATING_STATE, 'operating-state');
    assert.equal(DEVICE_FEATURE_TYPES.WATER_HEATER.REMAINING_HOT_WATER, 'remaining-hot-water');
    assert.equal(DEVICE_FEATURE_TYPES.WATER_HEATER.BOOST, 'boost');
    assert.equal(DEVICE_FEATURE_TYPES.CAMERA.ENABLED, 'enabled');
    assert.equal(DEVICE_FEATURE_TYPES.CAMERA.MOVE, 'move');
    assert.equal(DEVICE_FEATURE_TYPES.CAMERA.PRESET, 'preset');
    assert.equal(DEVICE_FEATURE_TYPES.CAMERA.PAN_POSITION, 'pan-position');
    assert.equal(DEVICE_FEATURE_TYPES.CAMERA.TILT_POSITION, 'tilt-position');
    assert.equal(DEVICE_FEATURE_TYPES.CAMERA.ZOOM_POSITION, 'zoom-position');
    assert.equal(DEVICE_FEATURE_TYPES.SIREN.TEST_IN_PROGRESS, 'test-in-progress');
    assert.equal(DEVICE_FEATURE_TYPES.SIREN.ALARM_MODE, 'alarm-mode');
    assert.equal(DEVICE_FEATURE_TYPES.SIREN.ALARM_STATE, 'alarm-state');
    assert.equal(DEVICE_FEATURE_TYPES.BATTERY.CHARGING, 'charging');
    assert.equal(DEVICE_FEATURE_TYPES.ENERGY_PRODUCTION_SENSOR.POWER, 'power');
    assert.equal(DEVICE_FEATURE_TYPES.GRID_SENSOR.INPUT_POWER, 'input-power');
    assert.equal(DEVICE_FEATURE_TYPES.GRID_SENSOR.OUTPUT_INDEX, 'output-index');
    assert.equal(DEVICE_FEATURE_TYPES.HOME_OUTPUT_SENSOR.OFF_GRID_POWER, 'off-grid-power');
    assert.equal(DEVICE_FEATURE_TYPES.TEXT.SELECT, 'select');
    assert.equal(DEVICE_FEATURE_TYPES.MAINTENANCE.LIFE_REMAINING, 'life-remaining');
  });

  it('should expose the canonical unit strings', () => {
    assert.equal(DEVICE_FEATURE_UNITS.CELSIUS, 'celsius');
    assert.equal(DEVICE_FEATURE_UNITS.FAHRENHEIT, 'fahrenheit');
    assert.equal(DEVICE_FEATURE_UNITS.PERCENT, 'percent');
    assert.equal(DEVICE_FEATURE_UNITS.WATT, 'watt');
    assert.equal(DEVICE_FEATURE_UNITS.CUBIC_METER_PER_HOUR, 'cubic-meter-per-hour');
  });

  it('should only contain string values (categories and units)', () => {
    for (const value of [...Object.values(DEVICE_FEATURE_CATEGORIES), ...Object.values(DEVICE_FEATURE_UNITS)]) {
      assert.equal(typeof value, 'string');
    }
  });

  it('should only contain string values, one level deep (types)', () => {
    for (const group of Object.values(DEVICE_FEATURE_TYPES)) {
      for (const value of Object.values(group)) {
        assert.equal(typeof value, 'string');
      }
    }
  });

  it('should declare the very same constants in index.d.ts', () => {
    // Resyncing with Gladys means editing both lib/device-constants.js and the
    // typings: this fails whenever one of the two is forgotten.
    assert.deepEqual(parseDeclaration('DEVICE_FEATURE_CATEGORIES'), DEVICE_FEATURE_CATEGORIES);
    assert.deepEqual(parseDeclaration('DEVICE_FEATURE_TYPES'), DEVICE_FEATURE_TYPES);
    assert.deepEqual(parseDeclaration('DEVICE_FEATURE_UNITS'), DEVICE_FEATURE_UNITS);
  });
});
