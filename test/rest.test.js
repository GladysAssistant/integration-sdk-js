const { expect } = require('chai');

const { GladysApiError } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('host API REST methods', () => {
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

  describe('gladys.publishDiscoveredDevices(devices)', () => {
    it('should POST /discovered_device with the complete list', async () => {
      const devices = [
        {
          name: 'Virtual switch',
          external_id: gladys.externalId('switch'),
          features: [
            {
              name: 'On/Off',
              external_id: gladys.externalId('switch:binary'),
              category: 'switch',
              type: 'binary',
              min: 0,
              max: 1,
              read_only: false,
              has_feedback: true,
              keep_history: true,
            },
          ],
        },
      ];
      const response = await gladys.publishDiscoveredDevices(devices);
      expect(response).to.deep.equal({ success: true, count: 1 });
      const requests = server.getRequests('POST', '/discovered_device');
      expect(requests).to.have.lengthOf(1);
      expect(requests[0].body).to.deep.equal({ devices });
      expect(requests[0].authorization).to.equal(`Bearer ${server.token}`);
    });
  });

  describe('gladys.getDevices()', () => {
    it('should GET /device and refresh gladys.devices', async () => {
      server.devices = [{ external_id: 'ext:ext-demo:switch', name: 'Switch' }];
      const devices = await gladys.getDevices();
      expect(devices).to.deep.equal(server.devices);
      expect(gladys.devices).to.deep.equal(server.devices);
    });
  });

  describe('gladys.publishState(featureExternalId, value)', () => {
    it('should publish a numeric state', async () => {
      const response = await gladys.publishState('ext:ext-demo:sensor:temperature', 21.5);
      expect(response).to.deep.equal({ success: true });
      const requests = server.getRequests('POST', '/state');
      expect(requests[0].body).to.deep.equal({
        states: [{ device_feature_external_id: 'ext:ext-demo:sensor:temperature', state: 21.5 }],
      });
    });

    it('should publish a text state with { text }', async () => {
      await gladys.publishState('ext:ext-demo:cam:text', { text: 'hello' });
      const requests = server.getRequests('POST', '/state');
      expect(requests[0].body).to.deep.equal({
        states: [{ device_feature_external_id: 'ext:ext-demo:cam:text', text: 'hello' }],
      });
    });

    it('should publish a past state with { state, created_at }', async () => {
      await gladys.publishState('ext:ext-demo:sensor:temperature', {
        state: 19.2,
        created_at: '2026-07-12T10:00:00.000Z',
      });
      const requests = server.getRequests('POST', '/state');
      expect(requests[0].body).to.deep.equal({
        states: [
          {
            device_feature_external_id: 'ext:ext-demo:sensor:temperature',
            state: 19.2,
            created_at: '2026-07-12T10:00:00.000Z',
          },
        ],
      });
    });
  });

  describe('gladys.publishStates(states)', () => {
    it('should POST /state with the batch', async () => {
      const states = [
        { device_feature_external_id: 'ext:ext-demo:a', state: 1 },
        { device_feature_external_id: 'ext:ext-demo:b', text: 'on' },
      ];
      const response = await gladys.publishStates(states);
      expect(response).to.deep.equal({ success: true });
      expect(server.getRequests('POST', '/state')[0].body).to.deep.equal({ states });
    });

    it('should throw when states is not an array', async () => {
      try {
        await gladys.publishStates({ state: 1 });
        throw new Error('should have thrown');
      } catch (e) {
        expect(e.message).to.match(/must be an array/);
      }
    });

    it('should throw when the batch exceeds 100 states', async () => {
      const states = Array.from({ length: 101 }, (unused, i) => ({
        device_feature_external_id: `ext:ext-demo:${i}`,
        state: i,
      }));
      try {
        await gladys.publishStates(states);
        throw new Error('should have thrown');
      } catch (e) {
        expect(e.message).to.match(/maximum 100 states/);
      }
      expect(server.getRequests('POST', '/state')).to.have.lengthOf(0);
    });

    it('should accept a batch of exactly 100 states', async () => {
      const states = Array.from({ length: 100 }, (unused, i) => ({
        device_feature_external_id: `ext:ext-demo:${i}`,
        state: i,
      }));
      const response = await gladys.publishStates(states);
      expect(response).to.deep.equal({ success: true });
    });
  });

  describe('gladys.getConfig() / gladys.setConfig()', () => {
    it('should GET /config and refresh gladys.config', async () => {
      server.config = { latitude: 48.85, api_key: 's3cr3t' };
      const config = await gladys.getConfig();
      expect(config).to.deep.equal(server.config);
      expect(gladys.config).to.deep.equal(server.config);
    });

    it('should POST /config with a partial merge', async () => {
      server.config = { latitude: 48.85 };
      const response = await gladys.setConfig({ pairing_state: 'done' });
      expect(response).to.deep.equal({ success: true });
      expect(server.getRequests('POST', '/config')[0].body).to.deep.equal({ config: { pairing_state: 'done' } });
      expect(server.config).to.deep.equal({ latitude: 48.85, pairing_state: 'done' });
    });
  });

  describe('gladys.getStatus()', () => {
    it('should GET /status', async () => {
      const status = await gladys.getStatus();
      expect(status.gladys_version).to.equal('4.62.0');
      expect(status.service.selector).to.equal('ext-demo');
    });
  });

  describe('error handling', () => {
    it('should throw a GladysApiError carrying the standard Gladys error attributes', async () => {
      server.forceResponse('POST', '/state', 429, {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit of 300 states/minute exceeded',
      });
      try {
        await gladys.publishState('ext:ext-demo:a', 1);
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).to.be.instanceOf(GladysApiError);
        expect(e.name).to.equal('GladysApiError');
        expect(e.status).to.equal(429);
        expect(e.code).to.equal('TOO_MANY_REQUESTS');
        expect(e.message).to.equal('Rate limit of 300 states/minute exceeded');
      }
    });

    it('should throw a 401 GladysApiError with an invalid token', async () => {
      const badClient = createClient(server, { token: 'wrong' });
      try {
        await badClient.getDevices();
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).to.be.instanceOf(GladysApiError);
        expect(e.status).to.equal(401);
        expect(e.code).to.equal('UNAUTHORIZED');
      }
    });

    it('should fall back to the HTTP status when the error body is not JSON', async () => {
      server.forceResponse('GET', '/status', 502, 'Bad Gateway (html)');
      try {
        await gladys.getStatus();
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).to.be.instanceOf(GladysApiError);
        expect(e.status).to.equal(502);
        expect(e.code).to.equal('UNKNOWN_ERROR');
      }
    });
  });
});
