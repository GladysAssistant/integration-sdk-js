const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { DEVICE_TRANSPORTS } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('per-device transport status (contract C.3)', () => {
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

  it('should export the DEVICE_TRANSPORTS values', () => {
    assert.deepEqual(DEVICE_TRANSPORTS, { LOCAL: 'local', CLOUD: 'cloud', UNREACHABLE: 'unreachable' });
  });

  describe('gladys.publishTransports(transports)', () => {
    it('should POST /device/transport with the batch, mapping external_id to device_external_id', async () => {
      const response = await gladys.publishTransports([
        { external_id: 'ext:ext-demo:plug:1', transport: DEVICE_TRANSPORTS.LOCAL },
        { external_id: 'ext:ext-demo:plug:2', transport: 'cloud' },
        { external_id: 'ext:ext-demo:plug:3', transport: 'unreachable' },
      ]);
      assert.deepEqual(response, { success: true });
      const requests = server.getRequests('POST', '/device/transport');
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].body, {
        transports: [
          { device_external_id: 'ext:ext-demo:plug:1', transport: 'local' },
          { device_external_id: 'ext:ext-demo:plug:2', transport: 'cloud' },
          { device_external_id: 'ext:ext-demo:plug:3', transport: 'unreachable' },
        ],
      });
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });

    it('should accept entries already keyed by device_external_id', async () => {
      await gladys.publishTransports([{ device_external_id: 'ext:ext-demo:plug:1', transport: 'local' }]);
      assert.deepEqual(server.getRequests('POST', '/device/transport')[0].body, {
        transports: [{ device_external_id: 'ext:ext-demo:plug:1', transport: 'local' }],
      });
    });

    it('should throw when transports is not an array', async () => {
      await assert.rejects(gladys.publishTransports({ transport: 'local' }), /must be an array/);
    });

    it('should throw when the batch exceeds 100 entries', async () => {
      const transports = Array.from({ length: 101 }, (unused, i) => ({
        external_id: `ext:ext-demo:${i}`,
        transport: 'local',
      }));
      await assert.rejects(gladys.publishTransports(transports), /maximum 100 transports/);
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should accept a batch of exactly 100 entries', async () => {
      const transports = Array.from({ length: 100 }, (unused, i) => ({
        external_id: `ext:ext-demo:${i}`,
        transport: 'local',
      }));
      const response = await gladys.publishTransports(transports);
      assert.deepEqual(response, { success: true });
    });

    it('should throw when an entry has no external id', async () => {
      await assert.rejects(gladys.publishTransports([{ transport: 'local' }]), /must carry an "external_id"/);
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when the transport value is unknown', async () => {
      await assert.rejects(
        gladys.publishTransports([{ external_id: 'ext:ext-demo:plug:1', transport: 'wifi' }]),
        /must be one of local, cloud, unreachable/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });
  });

  describe('degraded state (contract C.3)', () => {
    it('should forward degraded entries with their multi-language message', async () => {
      const response = await gladys.publishTransports([
        {
          external_id: 'ext:ext-demo:plug:1',
          transport: 'cloud',
          degraded: true,
          message: { en: 'Local session refused, falling back to cloud', fr: 'Session locale refusée, bascule cloud' },
        },
      ]);
      assert.deepEqual(response, { success: true });
      assert.deepEqual(server.getRequests('POST', '/device/transport')[0].body, {
        transports: [
          {
            device_external_id: 'ext:ext-demo:plug:1',
            transport: 'cloud',
            degraded: true,
            message: {
              en: 'Local session refused, falling back to cloud',
              fr: 'Session locale refusée, bascule cloud',
            },
          },
        ],
      });
    });

    it('should forward a degraded entry without message', async () => {
      await gladys.publishTransports([{ external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: true }]);
      assert.deepEqual(server.getRequests('POST', '/device/transport')[0].body, {
        transports: [{ device_external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: true }],
      });
    });

    it('should omit the degraded keys on nominal entries, so Gladys clears a previous degraded state', async () => {
      await gladys.publishTransports([
        { external_id: 'ext:ext-demo:plug:1', transport: 'local' },
        { external_id: 'ext:ext-demo:plug:2', transport: 'local', degraded: false },
      ]);
      assert.deepEqual(server.getRequests('POST', '/device/transport')[0].body, {
        transports: [
          { device_external_id: 'ext:ext-demo:plug:1', transport: 'local' },
          { device_external_id: 'ext:ext-demo:plug:2', transport: 'local' },
        ],
      });
    });

    it('should throw when degraded is not a boolean', async () => {
      await assert.rejects(
        gladys.publishTransports([{ external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: 'true' }]),
        /"degraded" must be a boolean/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when a message is given without degraded: true', async () => {
      await assert.rejects(
        gladys.publishTransports([
          { external_id: 'ext:ext-demo:plug:1', transport: 'cloud', message: { en: 'Ignored by Gladys' } },
        ]),
        /"message" is only taken into account when "degraded" is true/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when the message has no "en" key', async () => {
      await assert.rejects(
        gladys.publishTransports([
          { external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: true, message: { fr: 'Bascule cloud' } },
        ]),
        /"message" must be a multi-language object with a mandatory "en" key/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when the "en" key is inherited, as JSON serialization would drop it', async () => {
      await assert.rejects(
        gladys.publishTransports([
          {
            external_id: 'ext:ext-demo:plug:1',
            transport: 'cloud',
            degraded: true,
            message: Object.create({ en: 'Inherited, not serialized' }),
          },
        ]),
        /"message" must be a multi-language object with a mandatory "en" key/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when the message is an array', async () => {
      await assert.rejects(
        gladys.publishTransports([
          { external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: true, message: ['en'] },
        ]),
        /"message" must be a multi-language object with a mandatory "en" key/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when the message is not an object', async () => {
      await assert.rejects(
        gladys.publishTransports([
          { external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: true, message: 'plain string' },
        ]),
        /"message" must be a multi-language object with a mandatory "en" key/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should throw when a message language exceeds 200 characters', async () => {
      await assert.rejects(
        gladys.publishTransports([
          {
            external_id: 'ext:ext-demo:plug:1',
            transport: 'cloud',
            degraded: true,
            message: { en: 'ok', fr: 'x'.repeat(201) },
          },
        ]),
        /at most 200 characters/,
      );
      assert.equal(server.getRequests('POST', '/device/transport').length, 0);
    });

    it('should accept a message language of exactly 200 characters', async () => {
      const response = await gladys.publishTransports([
        { external_id: 'ext:ext-demo:plug:1', transport: 'cloud', degraded: true, message: { en: 'x'.repeat(200) } },
      ]);
      assert.deepEqual(response, { success: true });
    });
  });
});
