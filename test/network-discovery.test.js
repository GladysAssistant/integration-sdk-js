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

  it('should POST port and payload_base64 for a udp-active-broadcast scan with a Buffer payload', async () => {
    const payload = Buffer.from('kasa-discovery-request');
    await gladys.scanNetwork('udp-active-broadcast', { port: 9999, payload, timeoutSeconds: 5 });
    assert.deepEqual(server.getRequests('POST', '/network_discovery/scan')[0].body, {
      type: 'udp-active-broadcast',
      port: 9999,
      payload_base64: payload.toString('base64'),
      timeout_seconds: 5,
    });
  });

  it('should accept an already-base64-encoded string payload for a udp-active-broadcast scan', async () => {
    const payloadBase64 = Buffer.from('kasa-discovery-request').toString('base64');
    await gladys.scanNetwork('udp-active-broadcast', { port: 20002, payload: payloadBase64 });
    assert.deepEqual(server.getRequests('POST', '/network_discovery/scan')[0].body, {
      type: 'udp-active-broadcast',
      port: 20002,
      payload_base64: payloadBase64,
    });
  });

  it('should reject a udp-active-broadcast scan without a port, without any HTTP request', async () => {
    await assert.rejects(
      gladys.scanNetwork('udp-active-broadcast', { payload: Buffer.from('x') }),
      /"port" \(a manifest-declared port\) is required/,
    );
    assert.equal(server.getRequests('POST', '/network_discovery/scan').length, 0);
  });

  it('should reject a udp-active-broadcast scan without a payload, without any HTTP request', async () => {
    await assert.rejects(
      gladys.scanNetwork('udp-active-broadcast', { port: 9999 }),
      /"payload" \(a Buffer or a base64 string\) is required/,
    );
    assert.equal(server.getRequests('POST', '/network_discovery/scan').length, 0);
  });

  it('should reject an empty udp-active-broadcast payload, without any HTTP request', async () => {
    await assert.rejects(
      gladys.scanNetwork('udp-active-broadcast', { port: 9999, payload: Buffer.alloc(0) }),
      /"payload" must not be empty/,
    );
    // A non-empty string that decodes to zero bytes (invalid base64) is empty too.
    await assert.rejects(
      gladys.scanNetwork('udp-active-broadcast', { port: 9999, payload: '???' }),
      /"payload" must not be empty/,
    );
    assert.equal(server.getRequests('POST', '/network_discovery/scan').length, 0);
  });

  it('should reject a udp-active-broadcast payload over 512 decoded bytes, without any HTTP request', async () => {
    await assert.rejects(
      gladys.scanNetwork('udp-active-broadcast', { port: 9999, payload: Buffer.alloc(513) }),
      /maximum payload size is 512 decoded bytes/,
    );
    assert.equal(server.getRequests('POST', '/network_discovery/scan').length, 0);
  });

  it('should accept a udp-active-broadcast payload of exactly 512 decoded bytes', async () => {
    await gladys.scanNetwork('udp-active-broadcast', { port: 9999, payload: Buffer.alloc(512) });
    assert.equal(server.getRequests('POST', '/network_discovery/scan').length, 1);
  });

  it('should throw a 429 GladysApiError when the active-scan rate limit (1 scan / 10 s) is hit', async () => {
    server.forceResponse('POST', '/network_discovery/scan', 429, {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Only one active scan every 10 seconds per integration',
    });
    await assert.rejects(
      gladys.scanNetwork('udp-active-broadcast', { port: 9999, payload: Buffer.from('x') }),
      (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 429);
        assert.equal(error.code, 'TOO_MANY_REQUESTS');
        return true;
      },
    );
  });

  it('should support the full TP-Link-style flow: active scan, decode the unicast replies, publish discovered devices', async () => {
    // The integration forges the encrypted Kasa request and decrypts the
    // replies (the crypto stays in the container); the core only broadcasts
    // the payload and relays the raw unicast replies.
    server.networkScanResults = [
      {
        source_ip: '192.168.1.60',
        source_port: 9999,
        payload_base64: Buffer.from(JSON.stringify({ deviceId: 'kasa-plug-1', alias: 'Living room plug' })).toString(
          'base64',
        ),
      },
    ];
    const replies = await gladys.scanNetwork('udp-active-broadcast', {
      port: 9999,
      payload: Buffer.from('kasa-discovery-request'),
      timeoutSeconds: 5,
    });
    const devices = replies.map((reply) => {
      const info = JSON.parse(Buffer.from(reply.payload_base64, 'base64').toString());
      const ids = gladys.externalIds('plug', info.deviceId);
      return {
        name: info.alias,
        external_id: ids.device,
        // The integration then reaches the device in unicast at reply.source_ip.
        params: [{ name: 'IP_ADDRESS', value: reply.source_ip }],
        features: [],
      };
    });
    await gladys.publishDiscoveredDevices(devices);
    const published = server.getRequests('POST', '/discovered_device')[0].body.devices;
    assert.equal(published.length, 1);
    assert.equal(published[0].external_id, 'ext:ext-demo:plug:kasa-plug-1');
    assert.equal(published[0].name, 'Living room plug');
    assert.deepEqual(published[0].params, [{ name: 'IP_ADDRESS', value: '192.168.1.60' }]);
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
