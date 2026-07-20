const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES, DEVICE_FEATURE_UNITS } = require('../lib/device-constants');

describe('device constants', () => {
  it('should expose the canonical category strings', () => {
    assert.equal(DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR, 'temperature-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR, 'motion-sensor');
    assert.equal(DEVICE_FEATURE_CATEGORIES.SWITCH, 'switch');
    assert.equal(DEVICE_FEATURE_CATEGORIES.LIGHT, 'light');
  });

  it('should expose the canonical type strings, grouped by category', () => {
    assert.equal(DEVICE_FEATURE_TYPES.LIGHT.BINARY, 'binary');
    assert.equal(DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS, 'brightness');
    assert.equal(DEVICE_FEATURE_TYPES.SENSOR.DECIMAL, 'decimal');
    assert.equal(DEVICE_FEATURE_TYPES.SWITCH.POWER, 'power');
    assert.equal(DEVICE_FEATURE_TYPES.ENERGY_PRODUCTION_SENSOR.POWER, 'power');
  });

  it('should expose the canonical unit strings', () => {
    assert.equal(DEVICE_FEATURE_UNITS.CELSIUS, 'celsius');
    assert.equal(DEVICE_FEATURE_UNITS.FAHRENHEIT, 'fahrenheit');
    assert.equal(DEVICE_FEATURE_UNITS.PERCENT, 'percent');
    assert.equal(DEVICE_FEATURE_UNITS.WATT, 'watt');
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
});
