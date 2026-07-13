const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, deferred } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('lifecycle events (device-created/updated/deleted, config-updated)', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  it('should add the device to gladys.devices and call onDeviceCreated', async () => {
    const { promise: called, resolve } = deferred();
    gladys.onDeviceCreated(resolve);
    await gladys.connect();
    const device = { id: 'uuid-1', external_id: 'ext:ext-demo:sensor', name: 'Sensor' };
    server.send(EXTERNAL_INTEGRATION.DEVICE_CREATED, { device });
    const received = await called;
    assert.deepEqual(received, device);
    assert.deepEqual(gladys.devices, [device]);
  });

  it('should replace the device in gladys.devices and call onDeviceUpdated', async () => {
    server.devices = [{ id: 'uuid-1', external_id: 'ext:ext-demo:sensor', name: 'Old name' }];
    const { promise: called, resolve } = deferred();
    gladys.onDeviceUpdated(resolve);
    await gladys.connect();
    const updated = { id: 'uuid-1', external_id: 'ext:ext-demo:sensor', name: 'New name' };
    server.send(EXTERNAL_INTEGRATION.DEVICE_UPDATED, { device: updated });
    await called;
    assert.deepEqual(gladys.devices, [updated]);
  });

  it('should remove the device from gladys.devices and call onDeviceDeleted', async () => {
    server.devices = [{ id: 'uuid-1', external_id: 'ext:ext-demo:sensor', name: 'Sensor' }];
    const { promise: called, resolve } = deferred();
    gladys.onDeviceDeleted(resolve);
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_DELETED, { device: server.devices[0] });
    await called;
    assert.deepEqual(gladys.devices, []);
  });

  it('should update gladys.config and call onConfigUpdated with the complete values', async () => {
    server.config = { latitude: 48.85 };
    const { promise: called, resolve } = deferred();
    gladys.onConfigUpdated(resolve);
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.CONFIG_UPDATED, { config: { latitude: 43.6, unit: 'celsius' } });
    const received = await called;
    assert.deepEqual(received, { latitude: 43.6, unit: 'celsius' });
    assert.deepEqual(gladys.config, { latitude: 43.6, unit: 'celsius' });
  });

  it('should ignore lifecycle events silently when no handler is registered', async () => {
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_CREATED, { device: { external_id: 'ext:ext-demo:x' } });
    server.send(EXTERNAL_INTEGRATION.CONFIG_UPDATED, { config: { a: 1 } });
    await delay(20);
    assert.equal(gladys.connected, true);
    assert.deepEqual(gladys.devices, [{ external_id: 'ext:ext-demo:x' }]);
    assert.deepEqual(gladys.config, { a: 1 });
  });

  it('should ignore unknown message types silently (forward compatibility)', async () => {
    await gladys.connect();
    server.send('external-integration.camera.get-image', { message_id: 'msg-9' });
    server.sendRaw('this is not JSON');
    await delay(20);
    assert.equal(gladys.connected, true);
  });
});
