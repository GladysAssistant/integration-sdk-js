const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('Wake-on-LAN (gladys.wakeOnLan)', () => {
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

  it('should POST /network/wake with the MAC address only', async () => {
    await gladys.wakeOnLan({
      mac: '64:e4:d5:b4:12:66',
    });

    const requests = server.getRequests('POST', '/network/wake');

    assert.deepEqual(requests[0].body, {
      mac: '64:e4:d5:b4:12:66',
    });
    assert.equal(requests[0].authorization, `Bearer ${server.token}`);
  });

  it('should POST all Wake-on-LAN options', async () => {
    await gladys.wakeOnLan({
      mac: '64:e4:d5:b4:12:66',
      address: '192.168.1.255',
      port: 9,
      sourcePort: 0,
    });

    const requests = server.getRequests('POST', '/network/wake');

    assert.deepEqual(requests[0].body, {
      mac: '64:e4:d5:b4:12:66',
      address: '192.168.1.255',
      port: 9,
      sourcePort: 0,
    });
  });

  it('should reject missing options without any HTTP request', async () => {
    await assert.rejects(gladys.wakeOnLan(), /"options" must be an object/);

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should reject invalid options without any HTTP request', async () => {
    const invalidOptions = [null, [], 'invalid'];

    await Promise.all(
      invalidOptions.map((options) => assert.rejects(gladys.wakeOnLan(options), /"options" must be an object/)),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should reject a missing or invalid MAC address without any HTTP request', async () => {
    const invalidOptions = [{}, { mac: null }, { mac: '' }];

    await Promise.all(
      invalidOptions.map((options) => assert.rejects(gladys.wakeOnLan(options), /"mac" must be a non-empty string/)),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should reject an invalid address without any HTTP request', async () => {
    const invalidAddresses = ['', null, 123];

    await Promise.all(
      invalidAddresses.map((address) =>
        assert.rejects(
          gladys.wakeOnLan({
            mac: '64:e4:d5:b4:12:66',
            address,
          }),
          /"address" must be a non-empty string/,
        ),
      ),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should reject an invalid destination port without any HTTP request', async () => {
    const invalidPorts = [0, -1, 65536, 1.5, '9'];

    await Promise.all(
      invalidPorts.map((port) =>
        assert.rejects(
          gladys.wakeOnLan({
            mac: '64:e4:d5:b4:12:66',
            port,
          }),
          /"port" must be an integer between 1 and 65535/,
        ),
      ),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should accept destination port boundaries', async () => {
    await gladys.wakeOnLan({
      mac: '64:e4:d5:b4:12:66',
      port: 1,
    });

    await gladys.wakeOnLan({
      mac: '64:e4:d5:b4:12:66',
      port: 65535,
    });

    assert.equal(server.getRequests('POST', '/network/wake').length, 2);
  });

  it('should reject an invalid source port without any HTTP request', async () => {
    const invalidSourcePorts = [-1, 65536, 1.5, '9'];

    await Promise.all(
      invalidSourcePorts.map((sourcePort) =>
        assert.rejects(
          gladys.wakeOnLan({
            mac: '64:e4:d5:b4:12:66',
            sourcePort,
          }),
          /"sourcePort" must be an integer between 0 and 65535/,
        ),
      ),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });

  it('should accept source port boundaries', async () => {
    await gladys.wakeOnLan({
      mac: '64:e4:d5:b4:12:66',
      sourcePort: 0,
    });

    await gladys.wakeOnLan({
      mac: '64:e4:d5:b4:12:66',
      sourcePort: 65535,
    });

    assert.equal(server.getRequests('POST', '/network/wake').length, 2);
  });

  it('should throw a 403 GladysApiError when network_wake is not allowed', async () => {
    server.forceResponse('POST', '/network/wake', 403, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Wake-on-LAN is not allowed for this integration',
    });

    await assert.rejects(
      gladys.wakeOnLan({
        mac: '64:e4:d5:b4:12:66',
      }),
      (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 403);
        assert.equal(error.code, 'FORBIDDEN');
        return true;
      },
    );
  });
  it('should reject malformed non-empty MAC addresses without any HTTP request', async () => {
    const invalidMacAddresses = ['64:e4:d5:b4:12', '64:e4:d5:b4:12:zz', '64:e4-d5:b4:12:66'];

    await Promise.all(
      invalidMacAddresses.map((mac) => assert.rejects(gladys.wakeOnLan({ mac }), /"mac" must be a valid MAC address/)),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });
  it('should reject malformed non-empty IPv4 addresses without any HTTP request', async () => {
    const invalidAddresses = ['invalid-ip', '192.168.1', '999.168.1.1', '::1'];

    await Promise.all(
      invalidAddresses.map((address) =>
        assert.rejects(
          gladys.wakeOnLan({
            mac: '64:e4:d5:b4:12:66',
            address,
          }),
          /"address" must be a valid IPv4 address/,
        ),
      ),
    );

    assert.equal(server.getRequests('POST', '/network/wake').length, 0);
  });
});
