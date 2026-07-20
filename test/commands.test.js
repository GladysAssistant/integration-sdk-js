const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, deferred } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('commands (auto-ack through command-result)', () => {
  let server;
  let gladys;

  const device = { external_id: 'ext:ext-demo:switch', selector: 'switch', params: [] };
  const deviceFeature = { external_id: 'ext:ext-demo:switch:binary', category: 'switch', type: 'binary' };

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  it('should ack device.set-value with success:true when the handler resolves', async () => {
    const received = [];
    gladys.onSetValue(async (d, f, value) => {
      received.push([d, f, value]);
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_SET_VALUE, {
      message_id: 'msg-1',
      device,
      device_feature: deviceFeature,
      value: 1,
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-1', success: true });
    assert.deepEqual(received, [[device, deviceFeature, 1]]);
  });

  it('should send the resolved value in the ack data when it is not undefined', async () => {
    gladys.onSetValue(async () => ({ applied: true }));
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_SET_VALUE, {
      message_id: 'msg-data',
      device,
      device_feature: deviceFeature,
      value: 1,
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-data', success: true, data: { applied: true } });
  });

  it('should ack with success:false and the error message when the handler throws', async () => {
    gladys.onSetValue(async () => {
      throw new Error('device unreachable');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_SET_VALUE, {
      message_id: 'msg-2',
      device,
      device_feature: deviceFeature,
      value: 0,
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-2', success: false, error: 'device unreachable' });
  });

  it('should ack with success:false "not implemented" when no handler is registered', async () => {
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_SET_VALUE, {
      message_id: 'msg-3',
      device,
      device_feature: deviceFeature,
      value: 1,
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-3', success: false, error: 'not implemented' });
  });

  it('should ack device.poll after calling the poll handler with the device', async () => {
    const polled = [];
    gladys.onPoll(async (d) => {
      polled.push(d);
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_POLL, { message_id: 'msg-4', device });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-4', success: true });
    assert.deepEqual(polled, [device]);
  });

  it('should call the scan-request handler (no ack expected)', async () => {
    let scanCalls = 0;
    const { promise: scanCalled, resolve: resolveScan } = deferred();
    gladys.onScanRequest(async () => {
      scanCalls += 1;
      resolveScan();
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.SCAN_REQUEST, {});
    await scanCalled;
    assert.equal(scanCalls, 1);
  });

  it('should drop outgoing messages silently when the websocket is not open (no queue)', async () => {
    // Never connected: no socket at all.
    gladys._send(EXTERNAL_INTEGRATION.HEARTBEAT, {});
    // Connected then disconnected: socket exists but is closed.
    await gladys.connect();
    await gladys.disconnect();
    gladys._send(EXTERNAL_INTEGRATION.HEARTBEAT, {});
    assert.deepEqual(server.wsMessages, []);
  });

  it('should swallow errors of event handlers (no ack, no crash)', async () => {
    const { promise: scanCalled, resolve: resolveScan } = deferred();
    gladys.onScanRequest(async () => {
      resolveScan();
      throw new Error('scan failed');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.SCAN_REQUEST, {});
    await scanCalled;
    // Give the rejection a tick to propagate: the client must still be connected.
    await delay(20);
    assert.equal(gladys.connected, true);
  });
});
