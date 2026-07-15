const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { computeBackoffDelay } = require('../lib/backoff');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, once } = require('./helpers/create-client');

describe('reconnection', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    server.devices = [{ external_id: 'ext:ext-demo:switch' }];
    await server.start();
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  it('should reconnect after a network drop, re-authenticate and resynchronize', async () => {
    gladys = createClient(server);
    await gladys.connect();
    assert.equal(server.getRequests('GET', '/device').length, 1);

    server.devices = [{ external_id: 'ext:ext-demo:switch' }, { external_id: 'ext:ext-demo:sensor' }];
    server.config = { latitude: 43.6 };
    const disconnected = once(gladys, 'disconnected');
    const reconnected = once(gladys, 'connected');
    server.killConnections();
    await disconnected;
    assert.equal(gladys.connected, false);
    await reconnected;

    assert.equal(gladys.connected, true);
    // The resynchronization ran again on reconnection.
    assert.equal(server.getRequests('GET', '/device').length, 2);
    assert.equal(server.getRequests('GET', '/config').length, 2);
    assert.equal(gladys.devices.length, 2);
    assert.deepEqual(gladys.config, { latitude: 43.6 });
  });

  it('should reset the backoff attempt counter after a successful reconnection', async () => {
    gladys = createClient(server);
    await gladys.connect();
    server.killConnections();
    await once(gladys, 'connected');
    assert.equal(gladys.reconnectAttempts, 0);
  });
});

describe('computeBackoffDelay(attempt, baseDelay, maxDelay)', () => {
  it('should double the delay at each attempt: min(1s * 2^n, 60s)', () => {
    assert.equal(computeBackoffDelay(0, 1000, 60000), 1000);
    assert.equal(computeBackoffDelay(1, 1000, 60000), 2000);
    assert.equal(computeBackoffDelay(2, 1000, 60000), 4000);
    assert.equal(computeBackoffDelay(5, 1000, 60000), 32000);
  });

  it('should cap the delay at maxDelay', () => {
    assert.equal(computeBackoffDelay(6, 1000, 60000), 60000);
    assert.equal(computeBackoffDelay(20, 1000, 60000), 60000);
  });
});
