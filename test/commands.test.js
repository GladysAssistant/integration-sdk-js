const { expect } = require('chai');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

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
    expect(result.payload).to.deep.equal({ message_id: 'msg-1', success: true });
    expect(received).to.deep.equal([[device, deviceFeature, 1]]);
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
    expect(result.payload).to.deep.equal({ message_id: 'msg-2', success: false, error: 'device unreachable' });
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
    expect(result.payload).to.deep.equal({ message_id: 'msg-3', success: false, error: 'not implemented' });
  });

  it('should ack device.poll after calling the poll handler with the device', async () => {
    const polled = [];
    gladys.onPoll(async (d) => {
      polled.push(d);
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.DEVICE_POLL, { message_id: 'msg-4', device });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    expect(result.payload).to.deep.equal({ message_id: 'msg-4', success: true });
    expect(polled).to.deep.equal([device]);
  });

  it('should call the scan-request handler (no ack expected)', async () => {
    let scanCalls = 0;
    let resolveScan;
    const scanCalled = new Promise((resolve) => {
      resolveScan = resolve;
    });
    gladys.onScanRequest(async () => {
      scanCalls += 1;
      resolveScan();
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.SCAN_REQUEST, {});
    await scanCalled;
    expect(scanCalls).to.equal(1);
  });

  it('should drop outgoing messages silently when the websocket is not open (no queue)', async () => {
    // Never connected: no socket at all.
    gladys._send(EXTERNAL_INTEGRATION.HEARTBEAT, {});
    // Connected then disconnected: socket exists but is closed.
    await gladys.connect();
    await gladys.disconnect();
    gladys._send(EXTERNAL_INTEGRATION.HEARTBEAT, {});
    expect(server.wsMessages).to.deep.equal([]);
  });

  it('should swallow errors of event handlers (no ack, no crash)', async () => {
    let resolveScan;
    const scanCalled = new Promise((resolve) => {
      resolveScan = resolve;
    });
    gladys.onScanRequest(async () => {
      resolveScan();
      throw new Error('scan failed');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.SCAN_REQUEST, {});
    await scanCalled;
    // Give the rejection a tick to propagate: the client must still be connected.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(gladys.connected).to.equal(true);
  });
});
