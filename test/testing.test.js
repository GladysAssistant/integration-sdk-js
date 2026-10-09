const assert = require('node:assert/strict');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { describe, it } = require('node:test');

const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  GladysApiError,
  GladysIntegration,
  WEBSOCKET_MESSAGE_TYPES,
  createLogger,
} = require('../lib');
const { createFakeGladys } = require('../lib/testing');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

/** A valid discovered device of the 'test-integration' selector. */
const sensor = (overrides = {}) => ({
  name: 'Sensor',
  external_id: 'ext:test-integration:sensor:1',
  should_poll: true,
  poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
  features: [
    {
      name: 'Temperature',
      external_id: 'ext:test-integration:sensor:1:temperature',
      category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      read_only: true,
    },
  ],
  ...overrides,
});

/** Assert that a promise rejects with the 400 the host API answers. */
const rejectsWith400 = (promise, message) =>
  assert.rejects(promise, (error) => {
    assert.ok(error instanceof GladysApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'BAD_REQUEST');
    assert.match(error.message, message);
    return true;
  });

describe('createFakeGladys(options?)', () => {
  describe('the fake integration client', () => {
    it('should be a real GladysIntegration with the default test selector', () => {
      const gladys = createFakeGladys();
      assert.ok(gladys instanceof GladysIntegration);
      assert.equal(gladys.selector, 'test-integration');
      assert.equal(gladys.connected, false);
      assert.deepEqual(gladys.externalIds('plug', 'abc').feature('power'), 'ext:test-integration:plug:abc:power');
    });

    it('should accept a selector and a logger', () => {
      const logger = createLogger({ level: 'silent' });
      const gladys = createFakeGladys({ selector: 'weather', logger });
      assert.equal(gladys.externalId('station'), 'ext:weather:station');
      assert.equal(gladys.logger, logger);
    });

    it('should keep the real argument checks of the SDK', async () => {
      const gladys = createFakeGladys();
      await assert.rejects(gladys.publishStates({}), /must be an array/);
      await assert.rejects(gladys.publishSceneEvent('motion', { nested: {} }), /flat/);
      assert.throws(() => gladys.requestWidgetRefresh('Bad Key'), /widget key/);
      assert.equal(gladys.fake.requests.length, 0);
    });

    it('should copy the options, so the test data stays untouched', async () => {
      const houses = [{ id: 'house-1', name: 'Home', selector: 'home', latitude: 48.8, longitude: 2.3 }];
      const gladys = createFakeGladys({ houses });
      const received = await gladys.getHouses();
      received[0].name = 'Changed';
      assert.equal(houses[0].name, 'Home');
      assert.equal(gladys.fake.houses[0].name, 'Home');
    });
  });

  describe('connect() / disconnect()', () => {
    it('should resynchronize the devices and the config, then emit connected', async () => {
      const device = { external_id: 'ext:test-integration:sensor:1', name: 'Sensor' };
      const gladys = createFakeGladys({ devices: [device], config: { api_key: 'key' } });
      const connected = once(gladys, 'connected');
      await gladys.connect();
      await connected;
      assert.equal(gladys.connected, true);
      assert.deepEqual(gladys.devices, [device]);
      assert.deepEqual(gladys.config, { api_key: 'key' });
      assert.deepEqual(
        gladys.fake.requests.map(({ method, path }) => `${method} ${path}`),
        ['GET /device', 'GET /config'],
      );
    });

    it('should wait for the async connected listeners', async () => {
      const gladys = createFakeGladys();
      gladys.on('connected', async () => {
        await delay(5);
        await gladys.publishDiscoveredDevices([sensor()]);
      });
      await gladys.connect();
      assert.equal(gladys.fake.discoveredDevices.length, 1);
    });

    it('should run a once listener only once', async () => {
      const gladys = createFakeGladys();
      let calls = 0;
      gladys.once('connected', () => {
        calls += 1;
      });
      await gladys.connect();
      await gladys.disconnect();
      await gladys.connect();
      assert.equal(calls, 1);
    });

    it('should reject when a connected listener fails', async () => {
      const gladys = createFakeGladys();
      gladys.on('connected', async () => {
        throw new Error('init failed');
      });
      await assert.rejects(gladys.connect(), /init failed/);
    });

    it('should mark the client disconnected and wait for the disconnected listeners', async () => {
      const gladys = createFakeGladys();
      let stopped = false;
      gladys.on('disconnected', async () => {
        await delay(5);
        stopped = true;
      });
      await gladys.connect();
      await gladys.disconnect();
      assert.equal(gladys.connected, false);
      assert.equal(stopped, true);
    });

    it('should not emit disconnected when not connected', async () => {
      const gladys = createFakeGladys();
      let emitted = false;
      gladys.on('disconnected', () => {
        emitted = true;
      });
      await gladys.disconnect();
      assert.equal(emitted, false);
    });
  });

  describe('host API record', () => {
    it('should record the published states and give the last value of a feature', async () => {
      const gladys = createFakeGladys();
      const temperature = 'ext:test-integration:sensor:1:temperature';
      const status = 'ext:test-integration:sensor:1:status';
      const createdAt = new Date('2026-10-09T08:00:00.000Z');
      await gladys.publishState(temperature, 21.5);
      await gladys.publishState(temperature, { state: 20, created_at: createdAt });
      await gladys.publishStates([{ device_feature_external_id: status, text: 'idle' }]);
      assert.deepEqual(gladys.fake.states, [
        { device_feature_external_id: temperature, state: 21.5 },
        // What Gladys receives: the Date is serialized.
        { device_feature_external_id: temperature, state: 20, created_at: '2026-10-09T08:00:00.000Z' },
        { device_feature_external_id: status, text: 'idle' },
      ]);
      assert.equal(gladys.fake.lastState(temperature), 20);
      assert.equal(gladys.fake.lastState(status), 'idle');
      assert.equal(gladys.fake.lastState('ext:test-integration:unknown'), undefined);
    });

    it('should keep the last published list of discovered devices', async () => {
      const gladys = createFakeGladys();
      assert.deepEqual(gladys.fake.discoveredDevices, []);
      assert.deepEqual(
        await gladys.publishDiscoveredDevices([sensor(), sensor({ external_id: 'ext:test-integration:sensor:2' })]),
        {
          success: true,
          count: 2,
        },
      );
      await gladys.publishDiscoveredDevices([sensor()]);
      assert.deepEqual(gladys.fake.discoveredDevices, [sensor()]);
    });

    it('should record the connection statuses', async () => {
      const gladys = createFakeGladys();
      assert.equal(gladys.fake.connectionStatus, null);
      await gladys.setConnectionStatus(false, { en: 'Token expired' });
      await gladys.setConnectionStatus(true);
      assert.deepEqual(gladys.fake.connectionStatuses, [
        { connected: false, message: { en: 'Token expired' } },
        { connected: true },
      ]);
      assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
    });

    it('should record the transports, camera images, scene events and channel messages', async () => {
      const gladys = createFakeGladys();
      const plug = gladys.externalId('plug:abc');
      await gladys.publishTransports([
        { external_id: plug, transport: 'cloud', degraded: true, message: { en: 'Fallback' } },
      ]);
      await gladys.publishCameraImage(gladys.externalId('cam:1'), 'image/jpg;base64,AAAA');
      await gladys.publishSceneEvent('doorbell_pressed', { door: 'front' });
      await gladys.publishMessage('12345', 'Hello', { createdAt: new Date('2026-10-09T08:00:00.000Z') });
      assert.deepEqual(gladys.fake.transports, [
        { device_external_id: plug, transport: 'cloud', degraded: true, message: { en: 'Fallback' } },
      ]);
      assert.deepEqual(gladys.fake.cameraImages, [
        { device_external_id: 'ext:test-integration:cam:1', image: 'image/jpg;base64,AAAA' },
      ]);
      assert.deepEqual(gladys.fake.sceneEvents, [{ key: 'doorbell_pressed', data: { door: 'front' } }]);
      assert.deepEqual(gladys.fake.messages, [
        { contact_id: '12345', text: 'Hello', created_at: '2026-10-09T08:00:00.000Z' },
      ]);
    });

    it('should answer the scans with the scan results of their type', async () => {
      const mdns = [
        { name: 'Eve._hap._tcp.local', host: 'eve.local', addresses: ['192.168.1.20'], port: 80, txt: ['id=AA'] },
      ];
      const gladys = createFakeGladys({ scanResults: { mdns } });
      assert.deepEqual(await gladys.scanNetwork('mdns', { timeoutSeconds: 5 }), mdns);
      assert.deepEqual(await gladys.scanNetwork('ssdp'), []);
      assert.deepEqual(gladys.fake.scans, [{ type: 'mdns', timeout_seconds: 5 }, { type: 'ssdp' }]);
    });

    it('should record the refresh nudges, connected or not', () => {
      const gladys = createFakeGladys();
      gladys.requestWidgetRefresh('vacuum');
      gladys.requestWidgetRefresh('energy');
      gladys.requestWeatherRefresh();
      assert.deepEqual(gladys.fake.widgetRefreshes, ['vacuum', 'energy']);
      assert.equal(gladys.fake.weatherRefreshes, 1);
      assert.deepEqual(gladys.fake.wsMessages[0], {
        type: EXTERNAL_INTEGRATION.WIDGET_REFRESH,
        payload: { key: 'vacuum' },
      });
    });

    it('should serve the data given as options', async () => {
      const house = { id: 'house-1', name: 'Home', selector: 'home', latitude: null, longitude: null };
      const container = { name: 'mqtt', status: 'running', ports: [], devices: [] };
      const contact = { contact_id: '1', contact_name: 'John', linked_at: '2026-10-09T08:00:00.000Z', user: {} };
      const webhooks = { available: true, webhooks: [{ key: 'events', mode: 'fire_and_forget', url: 'https://x' }] };
      const status = {
        gladys_version: 'v4.90.0',
        service: { id: 'id', selector: 's', status: 'RUNNING', version: '2.0.0' },
      };
      const gladys = createFakeGladys({
        houses: [house],
        containers: [container],
        contacts: [contact],
        webhooks,
        status,
      });
      assert.deepEqual(await gladys.getHouses(), [house]);
      assert.deepEqual(await gladys.getContainers(), [container]);
      assert.deepEqual(await gladys.getContacts(), [contact]);
      assert.deepEqual(await gladys.getWebhooks(), webhooks);
      assert.deepEqual(await gladys.getStatus(), status);
    });

    it('should serve empty data and a running status by default', async () => {
      const gladys = createFakeGladys();
      assert.deepEqual(await gladys.getHouses(), []);
      assert.deepEqual(await gladys.getContainers(), []);
      assert.deepEqual(await gladys.getContacts(), []);
      assert.deepEqual(await gladys.getWebhooks(), { available: false, webhooks: [] });
      assert.deepEqual(await gladys.getConfig(), {});
      const { service } = await gladys.getStatus();
      assert.equal(service.selector, 'test-integration');
      assert.equal(service.status, 'RUNNING');
    });

    it('should merge setConfig into the served config', async () => {
      const gladys = createFakeGladys({ config: { api_key: 'key' } });
      await gladys.setConfig({ token: 'secret' });
      assert.deepEqual(gladys.fake.config, { api_key: 'key', token: 'secret' });
      assert.deepEqual(await gladys.getConfig(), { api_key: 'key', token: 'secret' });
    });

    it('should link any code to the linked user and list the contact', async () => {
      const linkedUser = { selector: 'jane', first_name: 'Jane', language: 'fr' };
      const gladys = createFakeGladys({ linkedUser });
      assert.deepEqual(await gladys.linkContact('CODE', '12345', 'Jane D.'), linkedUser);
      await gladys.linkContact('CODE', '12345');
      const contacts = await gladys.getContacts();
      assert.equal(contacts.length, 1);
      assert.equal(contacts[0].contact_id, '12345');
      assert.equal(contacts[0].contact_name, null);
      assert.deepEqual(contacts[0].user, linkedUser);
      assert.equal(typeof contacts[0].linked_at, 'string');
    });

    it('should answer success to the other calls and record them', async () => {
      const gladys = createFakeGladys();
      assert.deepEqual(await gladys.startContainer('mqtt', { env: { PASSWORD: 'x' } }), { success: true });
      assert.deepEqual(await gladys.wakeOnLan('64:e4:d5:b4:12:66'), { success: true });
      assert.deepEqual(gladys.fake.requests, [
        { method: 'POST', path: '/container/mqtt/start', body: { env: { PASSWORD: 'x' } }, status: 200 },
        { method: 'POST', path: '/network/wake', body: { mac: '64:e4:d5:b4:12:66' }, status: 200 },
      ]);
      assert.deepEqual(gladys.fake.bodies('POST', '/network/wake'), [{ mac: '64:e4:d5:b4:12:66' }]);
    });
  });

  describe('host API validation', () => {
    it('should accept a valid device, the poll frequency in milliseconds and a null unit', async () => {
      const gladys = createFakeGladys();
      const device = sensor();
      device.features[0].unit = null;
      assert.equal((await gladys.publishDiscoveredDevices([device])).count, 1);
    });

    it('should reject a poll frequency in seconds, like Gladys', async () => {
      const gladys = createFakeGladys();
      await rejectsWith400(
        gladys.publishDiscoveredDevices([sensor({ poll_frequency: 300 })]),
        /devices\[0\]\.poll_frequency: invalid poll frequency \(milliseconds, one of DEVICE_POLL_FREQUENCIES: 60000, 30000, 15000, 10000, 2000, 1000\)/,
      );
      // Recorded as received, but not as published.
      assert.equal(gladys.fake.requests[0].status, 400);
      assert.deepEqual(gladys.fake.discoveredDevices, []);
    });

    it('should reject the discovered devices Gladys refuses', async () => {
      const gladys = createFakeGladys();
      const feature = sensor().features[0];
      const cases = [
        ['not an array', /devices: must be an array/],
        [[null], /devices\[0\]: must be an object/],
        [[sensor({ name: '' })], /devices\[0\]\.name: must be a non-empty string/],
        [[sensor({ external_id: 'sensor:1' })], /devices\[0\]\.external_id: must start with "ext:test-integration:"/],
        [[sensor({ features: undefined })], /devices\[0\]\.features: must be an array/],
        [[sensor({ features: [null] })], /devices\[0\]\.features\[0\]: must be an object/],
        [
          [sensor({ features: [{ ...feature, external_id: 'temperature' }] })],
          /features\[0\]\.external_id: must start with/,
        ],
        [
          [sensor({ features: [{ ...feature, category: 'thermometer' }] })],
          /features\[0\]\.category: unknown category/,
        ],
        [[sensor({ features: [{ ...feature, type: 'float' }] })], /features\[0\]\.type: unknown type/],
        [[sensor({ features: [{ ...feature, unit: 'parsec' }] })], /features\[0\]\.unit: unknown unit/],
      ];
      for (const [devices, message] of cases) {
        await rejectsWith400(gladys.publishDiscoveredDevices(devices), message);
      }
    });

    it('should reject the states Gladys refuses', async () => {
      const gladys = createFakeGladys();
      const id = 'ext:test-integration:sensor:1:temperature';
      const cases = [
        [[null], /states\[0\]: must be an object/],
        [[{ device_feature_external_id: 'sensor:1:temperature', state: 1 }], /must start with "ext:test-integration:"/],
        [[{ device_feature_external_id: id }], /states\[0\]: must have a numeric "state" or a string "text"/],
        // NaN reaches Gladys as null.
        [[{ device_feature_external_id: id, state: NaN }], /must have a numeric "state"/],
        [
          [{ device_feature_external_id: id, state: 1, created_at: 'yesterday' }],
          /created_at: must be an ISO 8601 date/,
        ],
        [
          [{ device_feature_external_id: id, state: 1, created_at: 1700000000000 }],
          /created_at: must be an ISO 8601 date/,
        ],
      ];
      for (const [states, message] of cases) {
        await rejectsWith400(gladys.publishStates(states), message);
      }
      assert.deepEqual(gladys.fake.states, []);
    });
  });

  describe('simulations of Gladys calling the handlers', () => {
    const device = { external_id: 'ext:test-integration:plug:1', selector: 'plug-1', params: [] };
    const feature = { external_id: 'ext:test-integration:plug:1:binary', category: 'switch', type: 'binary' };

    it('should run onSetValue and resolve with its ack', async () => {
      const gladys = createFakeGladys();
      let received;
      gladys.onSetValue(async (...args) => {
        received = args;
        await gladys.publishState(args[1].external_id, args[2]);
      });
      assert.deepEqual(await gladys.fake.setValue(device, feature, 1), { success: true });
      assert.deepEqual(received, [device, feature, 1]);
      assert.equal(gladys.fake.lastState(feature.external_id), 1);
    });

    it('should resolve with a failed ack when the handler throws or is missing', async () => {
      const gladys = createFakeGladys();
      assert.deepEqual(await gladys.fake.poll(device), { success: false, error: 'not implemented' });
      gladys.onPoll(async () => {
        throw new Error('device unreachable');
      });
      assert.deepEqual(await gladys.fake.poll(device), { success: false, error: 'device unreachable' });
    });

    it('should run onPoll, onGetImage, onWeatherGet and onWeatherGetImage', async () => {
      const gladys = createFakeGladys();
      const polled = [];
      gladys.onPoll(async (polledDevice) => {
        polled.push(polledDevice);
      });
      gladys.onGetImage(async () => 'image/jpg;base64,AAAA');
      gladys.onWeatherGet(async (options) => ({ temperature: 20, weather: 'clear', datetime: 'now', options }));
      gladys.onWeatherGetImage(async (key) => `base64-of-${key}`);
      const weatherOptions = { latitude: 48.8, longitude: 2.3, language: 'en', units: 'metric' };
      assert.deepEqual(await gladys.fake.poll(device), { success: true });
      assert.deepEqual(polled, [device]);
      assert.deepEqual(await gladys.fake.getImage(device), { success: true, data: { image: 'image/jpg;base64,AAAA' } });
      assert.deepEqual((await gladys.fake.weatherGet(weatherOptions)).data.weather.options, weatherOptions);
      assert.deepEqual(await gladys.fake.weatherGetImage('radar'), {
        success: true,
        data: { image: 'base64-of-radar' },
      });
    });

    it('should run onScanRequest and let its error reject', async () => {
      const gladys = createFakeGladys();
      gladys.onScanRequest(async () => {
        await gladys.publishDiscoveredDevices([sensor()]);
      });
      assert.equal(await gladys.fake.scanRequest(), undefined);
      assert.equal(gladys.fake.discoveredDevices.length, 1);
      gladys.onScanRequest(async () => {
        throw new Error('scan failed');
      });
      await assert.rejects(gladys.fake.scanRequest(), /scan failed/);
    });

    it('should resolve an event without handler', async () => {
      const gladys = createFakeGladys();
      assert.equal(await gladys.fake.scanRequest(), undefined);
    });

    it('should create, update and delete a device on both sides', async () => {
      const gladys = createFakeGladys();
      const events = [];
      gladys.onDeviceCreated(async (d) => events.push(['created', d.name]));
      gladys.onDeviceUpdated(async (d) => events.push(['updated', d.name]));
      gladys.onDeviceDeleted(async (d) => events.push(['deleted', d.name]));
      await gladys.connect();
      await gladys.fake.deviceCreated(sensor());
      assert.deepEqual(gladys.devices, [sensor()]);
      assert.deepEqual(gladys.fake.devices, [sensor()]);
      await gladys.fake.deviceUpdated(sensor({ name: 'Renamed' }));
      assert.deepEqual(gladys.devices, [sensor({ name: 'Renamed' })]);
      assert.deepEqual(await gladys.getDevices(), [sensor({ name: 'Renamed' })]);
      await gladys.fake.deviceDeleted(sensor());
      assert.deepEqual(gladys.devices, []);
      assert.deepEqual(gladys.fake.devices, []);
      assert.deepEqual(events, [
        ['created', 'Sensor'],
        ['updated', 'Renamed'],
        ['deleted', 'Sensor'],
      ]);
    });

    it('should re-publish the deduplicated states of a device once created', async () => {
      const gladys = createFakeGladys();
      const states = [{ device_feature_external_id: 'ext:test-integration:sensor:1:temperature', state: 21 }];
      await gladys.publishChangedStates(states);
      assert.equal((await gladys.publishChangedStates(states)).count, 0);
      await gladys.fake.deviceCreated(sensor());
      assert.equal((await gladys.publishChangedStates(states)).count, 1);
    });

    it('should update the config on both sides with onConfigUpdated', async () => {
      const gladys = createFakeGladys({ config: { api_key: 'old' } });
      let received;
      gladys.onConfigUpdated(async (config) => {
        received = config;
      });
      await gladys.connect();
      await gladys.fake.configUpdated({ api_key: 'new' });
      assert.deepEqual(received, { api_key: 'new' });
      assert.deepEqual(gladys.config, { api_key: 'new' });
      assert.deepEqual(gladys.fake.config, { api_key: 'new' });
    });

    it('should run onHardwareUpdated', async () => {
      const gladys = createFakeGladys();
      const containers = [{ name: 'frigate', devices: [{ class: 'coral', granted: true, available: true }] }];
      let received;
      gladys.onHardwareUpdated(async (value) => {
        received = value;
      });
      await gladys.fake.hardwareUpdated(containers);
      assert.deepEqual(received, containers);
    });

    it('should run the OAuth handlers', async () => {
      const gladys = createFakeGladys();
      const calls = [];
      gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => `https://provider/authorize?key=${key}&r=${redirectUri}`);
      gladys.onOAuthCallback(async (...args) => {
        calls.push(args);
      });
      assert.deepEqual(await gladys.fake.oauthAuthorizeUrl('account', 'https://gladys/cb'), {
        success: true,
        data: { authorize_url: 'https://provider/authorize?key=account&r=https://gladys/cb' },
      });
      await gladys.fake.oauthCallback('account', { code: 'abc', state: 'xyz', redirectUri: 'https://gladys/cb' });
      await gladys.fake.oauthCallback('account');
      assert.deepEqual(calls, [
        ['account', { code: 'abc', state: 'xyz', redirectUri: 'https://gladys/cb' }],
        ['account', { code: undefined, state: undefined, redirectUri: undefined }],
      ]);
    });

    it('should run onSendMessage', async () => {
      const gladys = createFakeGladys();
      let received;
      gladys.onSendMessage(async (...args) => {
        received = args;
      });
      assert.deepEqual(await gladys.fake.sendMessage({ id: '12345' }, { text: 'Hello', file: null }), {
        success: true,
      });
      assert.deepEqual(received, [{ id: '12345' }, { text: 'Hello', file: null }]);
    });

    it('should relay the webhooks in both modes', async () => {
      const gladys = createFakeGladys();
      const requests = [];
      gladys.onWebhook('events', async (request) => {
        requests.push(request);
      });
      gladys.onWebhook('callback', async ({ query }) => ({
        status: 200,
        contentType: 'text/plain',
        body: query.challenge,
      }));
      const request = { method: 'POST', query: {}, body: '{"event":"motion"}', contentType: 'application/json' };
      assert.equal(await gladys.fake.webhook('events', request), undefined);
      assert.equal(await gladys.fake.webhook('events'), undefined);
      assert.deepEqual(requests, [
        request,
        { method: undefined, query: undefined, body: undefined, contentType: undefined },
      ]);
      assert.deepEqual(
        await gladys.fake.webhook('callback', { method: 'GET', query: { challenge: '42' } }, { mode: 'sync' }),
        { success: true, data: { status: 200, content_type: 'text/plain', body: '42' } },
      );
    });

    it('should update the webhook state on both sides with onWebhookUpdated', async () => {
      const gladys = createFakeGladys();
      const webhooks = { available: true, webhooks: [{ key: 'events', mode: 'fire_and_forget', url: 'https://x' }] };
      let received;
      gladys.onWebhookUpdated(async (value) => {
        received = value;
      });
      await gladys.fake.webhookUpdated(webhooks);
      assert.deepEqual(received, webhooks);
      assert.deepEqual(await gladys.getWebhooks(), webhooks);
    });

    it('should run the manifest actions and the scene actions', async () => {
      const gladys = createFakeGladys();
      gladys.onAction('test_connection', async (fields) => `ok ${JSON.stringify(fields)}`);
      gladys.onSceneAction('snapshot', async (fields) => ({ clip_id: `clip-${Object.keys(fields).length}` }));
      assert.deepEqual(await gladys.fake.action('test_connection', { ip: '1.2.3.4' }), {
        success: true,
        data: { message: 'ok {"ip":"1.2.3.4"}' },
      });
      assert.deepEqual(await gladys.fake.action('test_connection'), { success: true, data: { message: 'ok {}' } });
      assert.deepEqual(await gladys.fake.sceneAction('snapshot', { camera: 'x' }), {
        success: true,
        data: { outputs: { clip_id: 'clip-1' } },
      });
      assert.deepEqual(await gladys.fake.sceneAction('snapshot'), {
        success: true,
        data: { outputs: { clip_id: 'clip-0' } },
      });
    });

    it('should run the widget handlers', async () => {
      const gladys = createFakeGladys();
      const calls = [];
      gladys.onWidgetGet('vacuum', async (options) => {
        calls.push(options);
        return { components: [{ type: 'text', text: { en: 'Docked' } }] };
      });
      gladys.onWidgetGetImage(async (imageKey) => `base64-of-${imageKey}`);
      gladys.onWidgetAction('vacuum', async (actionKey, params, { settings }) => ({
        en: `${actionKey} ${params.room || ''} ${settings.vacuum || ''}`.trim(),
      }));
      assert.deepEqual(await gladys.fake.widgetGet('vacuum'), {
        success: true,
        data: { content: { components: [{ type: 'text', text: { en: 'Docked' } }] } },
      });
      await gladys.fake.widgetGet('vacuum', {
        settings: { vacuum: 'ext:test-integration:robot:1' },
        language: 'fr',
        units: 'us',
      });
      assert.deepEqual(calls, [
        { settings: {}, language: 'en', units: 'metric' },
        { settings: { vacuum: 'ext:test-integration:robot:1' }, language: 'fr', units: 'us' },
      ]);
      assert.deepEqual(await gladys.fake.widgetGetImage('poster-1'), {
        success: true,
        data: { image: 'base64-of-poster-1' },
      });
      assert.deepEqual(await gladys.fake.widgetAction('vacuum', 'start'), {
        success: true,
        data: { message: { en: 'start' } },
      });
      assert.deepEqual(
        await gladys.fake.widgetAction('vacuum', 'clean', { room: 'kitchen' }, { settings: { vacuum: 'robot' } }),
        { success: true, data: { message: { en: 'clean kitchen robot' } } },
      );
    });

    it('should send any message type through send()', async () => {
      const gladys = createFakeGladys();
      let scanned = false;
      gladys.onScanRequest(async () => {
        scanned = true;
      });
      assert.equal(await gladys.fake.send(EXTERNAL_INTEGRATION.SCAN_REQUEST), undefined);
      assert.equal(scanned, true);
      // Unknown types are ignored, like the real client does.
      assert.equal(await gladys.fake.send('external-integration.future-message', { anything: true }), undefined);
    });
  });

  describe('handleShutdown() / fake.shutdown(signal?)', () => {
    it('should run the cleanup then disconnect, without listening to the process signals', async () => {
      const gladys = createFakeGladys();
      const listeners = process.listenerCount('SIGTERM');
      const signals = [];
      gladys.handleShutdown(async (signal) => {
        signals.push(signal);
      });
      assert.equal(process.listenerCount('SIGTERM'), listeners);
      await gladys.connect();
      await gladys.fake.shutdown();
      assert.equal(gladys.connected, false);
      await gladys.fake.shutdown('SIGINT');
      assert.deepEqual(signals, ['SIGTERM', 'SIGINT']);
    });

    it('should disconnect even when the cleanup throws, then reject with its error', async () => {
      const gladys = createFakeGladys();
      gladys.handleShutdown(async () => {
        throw new Error('cleanup failed');
      });
      await gladys.connect();
      await assert.rejects(gladys.fake.shutdown(), /cleanup failed/);
      assert.equal(gladys.connected, false);
    });

    it('should only disconnect without cleanup', async () => {
      const gladys = createFakeGladys();
      gladys.handleShutdown();
      await gladys.connect();
      await gladys.fake.shutdown();
      assert.equal(gladys.connected, false);
    });
  });
});
