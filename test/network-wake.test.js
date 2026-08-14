const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('wake-on-lan (gladys.wakeOnLan)', () => {
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

  it('should POST /network/wake with the mac only by default', async () => {
    const result = await gladys.wakeOnLan('64:e4:d5:b4:12:66');
    assert.deepEqual(result, { success: true });
    const requests = server.getRequests('POST', '/network/wake');
    assert.deepEqual(requests[0].body, { mac: '64:e4:d5:b4:12:66' });
    assert.equal(requests[0].authorization, `Bearer ${server.token}`);
  });

  it('should accept the dash and bare MAC formats of the contract', async () => {
    await gladys.wakeOnLan('64-e4-d5-b4-12-66');
    await gladys.wakeOnLan('64E4D5B41266');
    const requests = server.getRequests('POST', '/network/wake');
    assert.deepEqual(requests[0].body, { mac: '64-e4-d5-b4-12-66' });
    assert.deepEqual(requests[1].body, { mac: '64E4D5B41266' });
  });

  it('should POST address, port and sourcePort when given', async () => {
    await gladys.wakeOnLan('64:e4:d5:b4:12:66', { address: '192.168.1.255', port: 7, sourcePort: 40000 });
    assert.deepEqual(server.getRequests('POST', '/network/wake')[0].body, {
      mac: '64:e4:d5:b4:12:66',
      address: '192.168.1.255',
      port: 7,
      sourcePort: 40000,
    });
  });

  it('should reject an invalid MAC address, without any HTTP request', async () => {
    await assert.rejects(gladys.wakeOnLan('not-a-mac'), /"mac" must be a MAC address/);
    await assert.rejects(gladys.wakeOnLan('64:e4:d5:b4:12'), /"mac" must be a MAC address/);
    await assert.rejects(gladys.wakeOnLan(undefined), /"mac" must be a MAC address/);
    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should reject an out-of-range port or sourcePort, without any HTTP request', async () => {
    await assert.rejects(
      gladys.wakeOnLan('64:e4:d5:b4:12:66', { port: 0 }),
      /"port" must be an integer between 1 and 65535/,
    );
    await assert.rejects(
      gladys.wakeOnLan('64:e4:d5:b4:12:66', { port: 65536 }),
      /"port" must be an integer between 1 and 65535/,
    );
    await assert.rejects(
      gladys.wakeOnLan('64:e4:d5:b4:12:66', { sourcePort: -1 }),
      /"sourcePort" must be an integer between 0 and 65535/,
    );
    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should throw a 403 GladysApiError when network_wake is not declared in the manifest', async () => {
    server.forceResponse('POST', '/network/wake', 403, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Wake-on-LAN is not allowed for this integration',
    });
    await assert.rejects(gladys.wakeOnLan('64:e4:d5:b4:12:66'), (error) => {
      assert.ok(error instanceof GladysApiError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    });
  });

  it('should throw a 429 GladysApiError when the wake rate limit (1 wake / 2 s) is hit', async () => {
    server.forceResponse('POST', '/network/wake', 429, {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'RATE_LIMIT_EXCEEDED: max 1 wake per 2 seconds',
    });
    await assert.rejects(gladys.wakeOnLan('64:e4:d5:b4:12:66'), (error) => {
      assert.ok(error instanceof GladysApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, 'TOO_MANY_REQUESTS');
      return true;
    });
  });
});
