const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('mediated network discovery (gladys.scanNetwork)', () => {
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

  it('should POST /network_discovery/scan with the type only by default', async () => {
    await gladys.scanNetwork('mdns');
    const requests = server.getRequests('POST', '/network_discovery/scan');
    assert.deepEqual(requests[0].body, { type: 'mdns' });
    assert.equal(requests[0].authorization, `Bearer ${server.token}`);
  });

  it('should POST /network_discovery/scan with timeout_seconds when timeoutSeconds is given', async () => {
    await gladys.scanNetwork('udp-broadcast', { timeoutSeconds: 10 });
    assert.deepEqual(server.getRequests('POST', '/network_discovery/scan')[0].body, {
      type: 'udp-broadcast',
      timeout_seconds: 10,
    });
  });

  it('should return the raw results untouched (parsing is the integration job)', async () => {
    server.networkScanResults = [
      { source_ip: '192.168.1.42', source_port: 6667, payload_base64: 'AAAB' },
      { source_ip: '192.168.1.43', source_port: 6667, payload_base64: 'AAAC' },
    ];
    const results = await gladys.scanNetwork('udp-broadcast', { timeoutSeconds: 5 });
    assert.deepEqual(results, server.networkScanResults);
  });

  it('should throw a 403 GladysApiError when the capture is not declared in the manifest', async () => {
    server.forceResponse('POST', '/network_discovery/scan', 403, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Capture type "ssdp" is not declared in the manifest network_discovery field',
    });
    await assert.rejects(gladys.scanNetwork('ssdp'), (error) => {
      assert.ok(error instanceof GladysApiError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    });
  });

  it('should support the full Tuya-style flow: scan, parse the raw payloads, publish discovered devices', async () => {
    // The core relays the raw UDP announcements; decoding them (tuyapi
    // MessageParser in the real integration) stays on the integration side.
    server.networkScanResults = [
      {
        source_ip: '192.168.1.42',
        source_port: 6667,
        payload_base64: Buffer.from(JSON.stringify({ gwId: 'tuya-device-1' })).toString('base64'),
      },
    ];
    const results = await gladys.scanNetwork('udp-broadcast', { timeoutSeconds: 10 });
    const devices = results.map((result) => {
      const announcement = JSON.parse(Buffer.from(result.payload_base64, 'base64').toString());
      const ids = gladys.externalIds('plug', announcement.gwId);
      return {
        name: `Tuya ${announcement.gwId}`,
        external_id: ids.device,
        // The integration then reaches the device in unicast at result.source_ip.
        params: [{ name: 'IP_ADDRESS', value: result.source_ip }],
        features: [],
      };
    });
    await gladys.publishDiscoveredDevices(devices);
    const published = server.getRequests('POST', '/discovered_device')[0].body.devices;
    assert.equal(published.length, 1);
    assert.equal(published[0].external_id, 'ext:ext-demo:plug:tuya-device-1');
    assert.deepEqual(published[0].params, [{ name: 'IP_ADDRESS', value: '192.168.1.42' }]);
  });
});
