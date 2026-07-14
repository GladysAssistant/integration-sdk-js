const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysIntegration } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, once } = require('./helpers/create-client');

describe('gladys.connect()', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    server.devices = [{ external_id: 'ext:ext-demo:switch', name: 'Switch' }];
    server.config = { latitude: 48.85 };
    await server.start();
  });

  afterEach(async () => {
    if (gladys) {
      await gladys.disconnect();
    }
    await server.stop();
  });

  it('should authenticate, resynchronize devices + config, then resolve', async () => {
    gladys = createClient(server);
    const connectedEvent = once(gladys, 'connected');
    await gladys.connect();
    await connectedEvent;
    assert.equal(gladys.connected, true);
    assert.deepEqual(gladys.devices, [{ external_id: 'ext:ext-demo:switch', name: 'Switch' }]);
    assert.deepEqual(gladys.config, { latitude: 48.85 });
    assert.equal(server.getRequests('GET', '/device').length, 1);
    assert.equal(server.getRequests('GET', '/config').length, 1);
  });

  it('should reject when Gladys refuses the token on the first connection', async () => {
    gladys = createClient(server, { token: 'wrong-token' });
    await assert.rejects(gladys.connect(), (error) => {
      assert.match(error.message, /authentication refused/);
      assert.match(error.message, /4000/);
      return true;
    });
    assert.equal(gladys.connected, false);
  });

  it('should keep retrying when the resynchronization fails, and resolve once it succeeds', async () => {
    server.forceResponse('GET', '/device', 500, { status: 500, code: 'SERVER_ERROR', message: 'boom' });
    gladys = createClient(server);
    const connectPromise = gladys.connect();
    // Let at least one failed resync + reconnection happen, then repair the endpoint.
    await delay(100);
    assert.equal(gladys.connected, false);
    server.forcedResponses.clear();
    await connectPromise;
    assert.equal(gladys.connected, true);
    assert.ok(server.getRequests('GET', '/device').length > 1);
  });

  it('should keep retrying when Gladys is not reachable yet, and resolve once it is', async () => {
    const { port } = server;
    await server.stop();
    gladys = createClient(server, { hostApiUrl: `http://127.0.0.1:${port}` });
    const connectPromise = gladys.connect();
    await delay(50);
    // Restart the server on the same port.
    server = new FakeGladysServer();
    await server.start(port);
    await connectPromise;
    assert.equal(gladys.connected, true);
  });

  it('should stop reconnecting for good when the token is refused after a successful connection', async () => {
    gladys = createClient(server);
    await gladys.connect();
    // The supervisor rotates the token (token_version bump): the old one is
    // now refused on reconnection (close code 4000).
    server.token = 'rotated-token';
    server.killConnections();
    await once(gladys, 'disconnected');
    // Let the reconnection attempt hit the 4000 close.
    await delay(200);
    assert.equal(gladys.connected, false);
    assert.equal(gladys.shouldReconnect, false);
    assert.equal(gladys.reconnectTimer, null);
    assert.equal(server.sockets.length, 0);
  });

  it('should support disconnect() then connect() again', async () => {
    gladys = createClient(server);
    await gladys.connect();
    await gladys.disconnect();
    assert.equal(gladys.connected, false);
    await gladys.connect();
    assert.equal(gladys.connected, true);
  });
});

describe('gladys.disconnect()', () => {
  let server;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should emit "disconnected", stop reconnecting and resolve', async () => {
    const gladys = createClient(server);
    await gladys.connect();
    const disconnectedEvent = once(gladys, 'disconnected');
    await gladys.disconnect();
    await disconnectedEvent;
    assert.equal(gladys.connected, false);
    // No reconnection happens afterwards.
    await delay(100);
    assert.equal(gladys.connected, false);
    assert.equal(server.sockets.length, 0);
  });

  it('should resolve when never connected', async () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'http://127.0.0.1:1', token: 't', selector: 's' });
    await gladys.disconnect();
    assert.equal(gladys.connected, false);
  });

  it('should clear a pending reconnection timer', async () => {
    const gladys = createClient(server);
    await gladys.connect();
    server.killConnections();
    // Wait for the close to be observed and a reconnection to be scheduled.
    await once(gladys, 'disconnected');
    await gladys.disconnect();
    await delay(100);
    assert.equal(gladys.connected, false);
  });
});
