const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysIntegration, GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');

const ENV_VARS = ['GLADYS_HOST_API_URL', 'GLADYS_INTEGRATION_TOKEN', 'GLADYS_INTEGRATION_SELECTOR'];

describe('new GladysIntegration()', () => {
  const savedEnv = {};

  beforeEach(() => {
    for (const name of ENV_VARS) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_VARS) {
      if (savedEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    }
  });

  it('should accept explicit options', () => {
    const gladys = new GladysIntegration({
      hostApiUrl: 'http://172.30.0.1:80',
      token: 'my-token',
      selector: 'ext-demo',
    });
    assert.equal(gladys.hostApiUrl, 'http://172.30.0.1:80');
    assert.equal(gladys.token, 'my-token');
    assert.equal(gladys.selector, 'ext-demo');
    assert.deepEqual(gladys.devices, []);
    assert.deepEqual(gladys.config, {});
    assert.equal(gladys.connected, false);
  });

  it('should read options from container env vars by default', () => {
    process.env.GLADYS_HOST_API_URL = 'http://172.30.0.1:80';
    process.env.GLADYS_INTEGRATION_TOKEN = 'env-token';
    process.env.GLADYS_INTEGRATION_SELECTOR = 'ext-env';
    const gladys = new GladysIntegration();
    assert.equal(gladys.hostApiUrl, 'http://172.30.0.1:80');
    assert.equal(gladys.token, 'env-token');
    assert.equal(gladys.selector, 'ext-env');
  });

  it('should strip the trailing slash of hostApiUrl and derive the WS URL', () => {
    const gladys = new GladysIntegration({
      hostApiUrl: 'http://172.30.0.1:80/',
      token: 't',
      selector: 's',
    });
    assert.equal(gladys.hostApiUrl, 'http://172.30.0.1:80');
    assert.equal(gladys.wsUrl, 'ws://172.30.0.1:80');
  });

  it('should derive a wss:// URL from an https:// host API URL', () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'https://gladys.local', token: 't', selector: 's' });
    assert.equal(gladys.wsUrl, 'wss://gladys.local');
  });

  it('should throw when hostApiUrl is missing', () => {
    assert.throws(() => new GladysIntegration({ token: 't', selector: 's' }), /hostApiUrl/);
  });

  it('should throw when token is missing', () => {
    assert.throws(() => new GladysIntegration({ hostApiUrl: 'http://h', selector: 's' }), /token/);
  });

  it('should throw when selector is missing', () => {
    assert.throws(() => new GladysIntegration({ hostApiUrl: 'http://h', token: 't' }), /selector/);
  });
});

describe('gladys.externalId(suffix)', () => {
  it('should build a prefixed external id', () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'http://h', token: 't', selector: 'ext-demo' });
    assert.equal(gladys.externalId('switch:binary'), 'ext:ext-demo:switch:binary');
  });
});

describe('gladys.externalIds(type, platformId)', () => {
  it('should build the device id and a feature id factory', () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'http://h', token: 't', selector: 'ext-demo' });
    const ids = gladys.externalIds('plug', '0x00158d0001a2b3c4');
    assert.equal(ids.device, 'ext:ext-demo:plug:0x00158d0001a2b3c4');
    assert.equal(ids.feature('power'), 'ext:ext-demo:plug:0x00158d0001a2b3c4:power');
    assert.equal(ids.feature('binary'), 'ext:ext-demo:plug:0x00158d0001a2b3c4:binary');
  });
});

describe('module exports', () => {
  it('should expose GladysIntegration, GladysApiError and WEBSOCKET_MESSAGE_TYPES', () => {
    assert.equal(typeof GladysIntegration, 'function');
    assert.equal(typeof GladysApiError, 'function');
    assert.equal(
      WEBSOCKET_MESSAGE_TYPES.EXTERNAL_INTEGRATION.DEVICE_SET_VALUE,
      'external-integration.device.set-value',
    );
  });

  it('should expose the device constants and the logger', () => {
    const sdk = require('../lib');
    assert.equal(sdk.DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR, 'temperature-sensor');
    assert.equal(sdk.DEVICE_FEATURE_TYPES.SWITCH.BINARY, 'binary');
    assert.equal(sdk.DEVICE_FEATURE_UNITS.CELSIUS, 'celsius');
    assert.equal(typeof sdk.createLogger, 'function');
    assert.equal(typeof sdk.logger.info, 'function');
  });

  it('should expose the same API through the ESM wrapper', async () => {
    const esm = await import('../esm/index.mjs');
    const sdk = require('../lib');
    assert.equal(esm.GladysIntegration, GladysIntegration);
    assert.equal(esm.GladysApiError, GladysApiError);
    assert.equal(esm.WEBSOCKET_MESSAGE_TYPES, WEBSOCKET_MESSAGE_TYPES);
    assert.equal(esm.DEVICE_FEATURE_CATEGORIES, sdk.DEVICE_FEATURE_CATEGORIES);
    assert.equal(esm.DEVICE_FEATURE_TYPES, sdk.DEVICE_FEATURE_TYPES);
    assert.equal(esm.DEVICE_FEATURE_UNITS, sdk.DEVICE_FEATURE_UNITS);
    assert.equal(esm.createLogger, sdk.createLogger);
    assert.equal(esm.logger, sdk.logger);
    assert.equal(esm.default.GladysIntegration, GladysIntegration);
  });
});
