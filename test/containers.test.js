const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('connection status & sub-container methods', () => {
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

  describe('gladys.setConnectionStatus(connected, message?)', () => {
    it('should POST /connection_status with the multi-language message', async () => {
      const message = { en: 'Token expired, please reconnect.', fr: 'Token expiré, reconnectez-vous.' };
      const response = await gladys.setConnectionStatus(false, message);
      assert.deepEqual(response, { success: true });
      const requests = server.getRequests('POST', '/connection_status');
      assert.deepEqual(requests[0].body, { connected: false, message });
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });

    it('should POST /connection_status without a message field when omitted', async () => {
      await gladys.setConnectionStatus(true);
      assert.deepEqual(server.getRequests('POST', '/connection_status')[0].body, { connected: true });
    });
  });

  describe('gladys.getContainers()', () => {
    it('should GET /container and return the declared sub-containers', async () => {
      server.containers = [
        { name: 'mqtt', status: 'running', desired: 'running', started_at: '2026-07-13T08:00:00.000Z', ports: [] },
        {
          name: 'frigate',
          status: 'stopped',
          desired: 'stopped',
          started_at: null,
          ports: [{ container_port: 5000, host_port: 42115 }],
          devices: [{ class: 'coral-usb', granted: true, available: true }],
        },
      ];
      const containers = await gladys.getContainers();
      assert.deepEqual(containers, server.containers);
    });
  });

  describe('gladys.startContainer(name, options?)', () => {
    it('should POST /container/:name/start with an empty body by default', async () => {
      const response = await gladys.startContainer('mqtt');
      assert.deepEqual(response, { success: true });
      assert.deepEqual(server.getRequests('POST', '/container/mqtt/start')[0].body, {});
    });

    it('should POST /container/:name/start with the runtime env', async () => {
      await gladys.startContainer('mqtt', { env: { MQTT_PASSWORD: 's3cr3t' } });
      assert.deepEqual(server.getRequests('POST', '/container/mqtt/start')[0].body, {
        env: { MQTT_PASSWORD: 's3cr3t' },
      });
    });
  });

  describe('gladys.stopContainer(name)', () => {
    it('should POST /container/:name/stop', async () => {
      const response = await gladys.stopContainer('mqtt');
      assert.deepEqual(response, { success: true });
      assert.deepEqual(server.getRequests('POST', '/container/mqtt/stop')[0].body, {});
    });
  });

  describe('gladys.restartContainer(name)', () => {
    it('should POST /container/:name/restart', async () => {
      const response = await gladys.restartContainer('frigate');
      assert.deepEqual(response, { success: true });
      assert.deepEqual(server.getRequests('POST', '/container/frigate/restart')[0].body, {});
    });
  });
});
