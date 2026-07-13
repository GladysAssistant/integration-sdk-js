const { expect } = require('chai');

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
    expect(server.getRequests('GET', '/device')).to.have.lengthOf(1);

    server.devices = [{ external_id: 'ext:ext-demo:switch' }, { external_id: 'ext:ext-demo:sensor' }];
    server.config = { latitude: 43.6 };
    const disconnected = once(gladys, 'disconnected');
    const reconnected = once(gladys, 'connected');
    server.killConnections();
    await disconnected;
    expect(gladys.connected).to.equal(false);
    await reconnected;

    expect(gladys.connected).to.equal(true);
    // The resynchronization ran again on reconnection.
    expect(server.getRequests('GET', '/device')).to.have.lengthOf(2);
    expect(server.getRequests('GET', '/config')).to.have.lengthOf(2);
    expect(gladys.devices).to.have.lengthOf(2);
    expect(gladys.config).to.deep.equal({ latitude: 43.6 });
  });

  it('should reset the backoff attempt counter after a successful reconnection', async () => {
    gladys = createClient(server);
    await gladys.connect();
    server.killConnections();
    await once(gladys, 'connected');
    expect(gladys.reconnectAttempts).to.equal(0);
  });
});

describe('computeBackoffDelay(attempt, baseDelay, maxDelay)', () => {
  it('should double the delay at each attempt: min(1s * 2^n, 60s)', () => {
    expect(computeBackoffDelay(0, 1000, 60000)).to.equal(1000);
    expect(computeBackoffDelay(1, 1000, 60000)).to.equal(2000);
    expect(computeBackoffDelay(2, 1000, 60000)).to.equal(4000);
    expect(computeBackoffDelay(5, 1000, 60000)).to.equal(32000);
  });

  it('should cap the delay at maxDelay', () => {
    expect(computeBackoffDelay(6, 1000, 60000)).to.equal(60000);
    expect(computeBackoffDelay(20, 1000, 60000)).to.equal(60000);
  });
});
