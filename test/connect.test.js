const { expect } = require('chai');

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
    expect(gladys.connected).to.equal(true);
    expect(gladys.devices).to.deep.equal([{ external_id: 'ext:ext-demo:switch', name: 'Switch' }]);
    expect(gladys.config).to.deep.equal({ latitude: 48.85 });
    expect(server.getRequests('GET', '/device')).to.have.lengthOf(1);
    expect(server.getRequests('GET', '/config')).to.have.lengthOf(1);
  });

  it('should reject when Gladys refuses the token on the first connection', async () => {
    gladys = createClient(server, { token: 'wrong-token' });
    try {
      await gladys.connect();
      throw new Error('connect() should have rejected');
    } catch (e) {
      expect(e.message).to.match(/authentication refused/);
      expect(e.message).to.include('4000');
    }
    expect(gladys.connected).to.equal(false);
  });

  it('should keep retrying when the resynchronization fails, and resolve once it succeeds', async () => {
    server.forceResponse('GET', '/device', 500, { status: 500, code: 'SERVER_ERROR', message: 'boom' });
    gladys = createClient(server);
    const connectPromise = gladys.connect();
    // Let at least one failed resync + reconnection happen, then repair the endpoint.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(gladys.connected).to.equal(false);
    server.forcedResponses.clear();
    await connectPromise;
    expect(gladys.connected).to.equal(true);
    expect(server.getRequests('GET', '/device').length).to.be.greaterThan(1);
  });

  it('should keep retrying when Gladys is not reachable yet, and resolve once it is', async () => {
    const { port } = server;
    await server.stop();
    gladys = createClient(server, { hostApiUrl: `http://127.0.0.1:${port}` });
    const connectPromise = gladys.connect();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    // Restart the server on the same port.
    server = new FakeGladysServer();
    await server.start(port);
    await connectPromise;
    expect(gladys.connected).to.equal(true);
  });

  it('should support disconnect() then connect() again', async () => {
    gladys = createClient(server);
    await gladys.connect();
    await gladys.disconnect();
    expect(gladys.connected).to.equal(false);
    await gladys.connect();
    expect(gladys.connected).to.equal(true);
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
    expect(gladys.connected).to.equal(false);
    // No reconnection happens afterwards.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(gladys.connected).to.equal(false);
    expect(server.sockets).to.have.lengthOf(0);
  });

  it('should resolve when never connected', async () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'http://127.0.0.1:1', token: 't', selector: 's' });
    await gladys.disconnect();
    expect(gladys.connected).to.equal(false);
  });

  it('should clear a pending reconnection timer', async () => {
    const gladys = createClient(server);
    await gladys.connect();
    server.killConnections();
    // Wait for the close to be observed and a reconnection to be scheduled.
    await once(gladys, 'disconnected');
    await gladys.disconnect();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(gladys.connected).to.equal(false);
  });
});
