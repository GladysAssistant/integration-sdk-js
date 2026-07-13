const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('host API REST methods', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('gladys.publishDiscoveredDevices(devices)', () => {
    it('should POST /discovered_device with the complete list', async () => {
      const devices = [
        {
          name: 'Virtual switch',
          external_id: gladys.externalId('switch'),
          features: [
            {
              name: 'On/Off',
              external_id: gladys.externalId('switch:binary'),
              category: 'switch',
              type: 'binary',
              min: 0,
              max: 1,
              read_only: false,
              has_feedback: true,
              keep_history: true,
            },
          ],
        },
      ];
      const response = await gladys.publishDiscoveredDevices(devices);
      assert.deepEqual(response, { success: true, count: 1 });
      const requests = server.getRequests('POST', '/discovered_device');
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].body, { devices });
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });
  });

  describe('gladys.getDevices()', () => {
    it('should GET /device and refresh gladys.devices', async () => {
      server.devices = [{ external_id: 'ext:ext-demo:switch', name: 'Switch' }];
      const devices = await gladys.getDevices();
      assert.deepEqual(devices, server.devices);
      assert.deepEqual(gladys.devices, server.devices);
    });
  });

  describe('gladys.publishState(featureExternalId, value)', () => {
    it('should publish a numeric state', async () => {
      const response = await gladys.publishState('ext:ext-demo:sensor:temperature', 21.5);
      assert.deepEqual(response, { success: true });
      const requests = server.getRequests('POST', '/state');
      assert.deepEqual(requests[0].body, {
        states: [{ device_feature_external_id: 'ext:ext-demo:sensor:temperature', state: 21.5 }],
      });
    });

    it('should publish a text state with { text }', async () => {
      await gladys.publishState('ext:ext-demo:cam:text', { text: 'hello' });
      const requests = server.getRequests('POST', '/state');
      assert.deepEqual(requests[0].body, {
        states: [{ device_feature_external_id: 'ext:ext-demo:cam:text', text: 'hello' }],
      });
    });

    it('should publish a past state with { state, created_at }', async () => {
      await gladys.publishState('ext:ext-demo:sensor:temperature', {
        state: 19.2,
        created_at: '2026-07-12T10:00:00.000Z',
      });
      const requests = server.getRequests('POST', '/state');
      assert.deepEqual(requests[0].body, {
        states: [
          {
            device_feature_external_id: 'ext:ext-demo:sensor:temperature',
            state: 19.2,
            created_at: '2026-07-12T10:00:00.000Z',
          },
        ],
      });
    });
  });

  describe('gladys.publishStates(states)', () => {
    it('should POST /state with the batch', async () => {
      const states = [
        { device_feature_external_id: 'ext:ext-demo:a', state: 1 },
        { device_feature_external_id: 'ext:ext-demo:b', text: 'on' },
      ];
      const response = await gladys.publishStates(states);
      assert.deepEqual(response, { success: true });
      assert.deepEqual(server.getRequests('POST', '/state')[0].body, { states });
    });

    it('should throw when states is not an array', async () => {
      await assert.rejects(gladys.publishStates({ state: 1 }), /must be an array/);
    });

    it('should throw when the batch exceeds 100 states', async () => {
      const states = Array.from({ length: 101 }, (unused, i) => ({
        device_feature_external_id: `ext:ext-demo:${i}`,
        state: i,
      }));
      await assert.rejects(gladys.publishStates(states), /maximum 100 states/);
      assert.equal(server.getRequests('POST', '/state').length, 0);
    });

    it('should accept a batch of exactly 100 states', async () => {
      const states = Array.from({ length: 100 }, (unused, i) => ({
        device_feature_external_id: `ext:ext-demo:${i}`,
        state: i,
      }));
      const response = await gladys.publishStates(states);
      assert.deepEqual(response, { success: true });
    });
  });

  describe('gladys.getConfig() / gladys.setConfig()', () => {
    it('should GET /config and refresh gladys.config', async () => {
      server.config = { latitude: 48.85, api_key: 's3cr3t' };
      const config = await gladys.getConfig();
      assert.deepEqual(config, server.config);
      assert.deepEqual(gladys.config, server.config);
    });

    it('should POST /config with a partial merge', async () => {
      server.config = { latitude: 48.85 };
      const response = await gladys.setConfig({ pairing_state: 'done' });
      assert.deepEqual(response, { success: true });
      assert.deepEqual(server.getRequests('POST', '/config')[0].body, { config: { pairing_state: 'done' } });
      assert.deepEqual(server.config, { latitude: 48.85, pairing_state: 'done' });
    });
  });

  describe('gladys.getStatus()', () => {
    it('should GET /status', async () => {
      const status = await gladys.getStatus();
      assert.equal(status.gladys_version, '4.62.0');
      assert.equal(status.service.selector, 'ext-demo');
    });
  });

  describe('error handling', () => {
    it('should throw a GladysApiError carrying the standard Gladys error attributes', async () => {
      server.forceResponse('POST', '/state', 429, {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit of 300 states/minute exceeded',
      });
      await assert.rejects(gladys.publishState('ext:ext-demo:a', 1), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.name, 'GladysApiError');
        assert.equal(error.status, 429);
        assert.equal(error.code, 'TOO_MANY_REQUESTS');
        assert.equal(error.message, 'Rate limit of 300 states/minute exceeded');
        return true;
      });
    });

    it('should throw a 401 GladysApiError with an invalid token', async () => {
      const badClient = createClient(server, { token: 'wrong' });
      await assert.rejects(badClient.getDevices(), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 401);
        assert.equal(error.code, 'UNAUTHORIZED');
        return true;
      });
    });

    it('should fall back to the HTTP status when the error body is not JSON', async () => {
      server.forceResponse('GET', '/status', 502, 'Bad Gateway (html)');
      await assert.rejects(gladys.getStatus(), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 502);
        assert.equal(error.code, 'UNKNOWN_ERROR');
        return true;
      });
    });
  });
});
