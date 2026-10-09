/**
 * Test helpers of the SDK, for the integrations' own unit tests:
 * `@gladysassistant/integration-sdk/testing`.
 *
 * createFakeGladys() returns a REAL GladysIntegration whose transport is an
 * in-memory Gladys: no HTTP server, no WebSocket. Every SDK method keeps its
 * real code (argument checks, payload mapping, local state, deduplication),
 * so the code under test calls exactly the API it calls in production — and
 * the fake records what Gladys RECEIVES (the JSON bodies, after the SDK
 * mapping), answers like the host API, and plays Gladys' side of the
 * WebSocket (commands, events) through `gladys.fake`.
 */

const { WEBSOCKET_MESSAGE_TYPES } = require('./constants');
const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} = require('./device-constants');
const { GladysApiError } = require('./errors');
const { GladysIntegration } = require('./gladys-integration');
const { createLogger } = require('./logger');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

const POLL_FREQUENCIES = Object.values(DEVICE_POLL_FREQUENCIES);
const CATEGORIES = Object.values(DEVICE_FEATURE_CATEGORIES);
const TYPES = Object.values(DEVICE_FEATURE_TYPES).flatMap((types) => Object.values(types));
const UNITS = Object.values(DEVICE_FEATURE_UNITS);

/**
 * @description Clone a value through JSON, like the wire does (Dates become
 * ISO strings, undefined keys disappear).
 * @param {any} value - Value to clone.
 * @returns {any} The clone, or undefined.
 * @example
 * toWire({ created_at: new Date() });
 */
const toWire = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * @description Build the error the host API answers to an invalid payload.
 * @param {string} message - Error message.
 * @returns {GladysApiError} A 400 BAD_REQUEST error.
 * @example
 * throw badRequest('states[0]: must be an object');
 */
const badRequest = (message) => new GladysApiError(400, 'BAD_REQUEST', message);

/**
 * @description Check a POST /discovered_device body like the Gladys core does
 * (main rules of setDiscoveredDevices).
 * @param {string} prefix - External id prefix of the integration: `ext:<selector>:`.
 * @param {any} devices - Published devices.
 * @example
 * validateDiscoveredDevices('ext:demo:', devices);
 */
const validateDiscoveredDevices = (prefix, devices) => {
  if (!Array.isArray(devices)) {
    throw badRequest('devices: must be an array');
  }
  devices.forEach((device, index) => {
    if (device === null || typeof device !== 'object') {
      throw badRequest(`devices[${index}]: must be an object`);
    }
    if (typeof device.name !== 'string' || device.name.length === 0) {
      throw badRequest(`devices[${index}].name: must be a non-empty string`);
    }
    if (typeof device.external_id !== 'string' || !device.external_id.startsWith(prefix)) {
      throw badRequest(`devices[${index}].external_id: must start with "${prefix}"`);
    }
    if (device.poll_frequency !== undefined && !POLL_FREQUENCIES.includes(device.poll_frequency)) {
      throw badRequest(
        `devices[${index}].poll_frequency: invalid poll frequency (milliseconds, one of DEVICE_POLL_FREQUENCIES: ${POLL_FREQUENCIES.join(', ')})`,
      );
    }
    if (!Array.isArray(device.features)) {
      throw badRequest(`devices[${index}].features: must be an array`);
    }
    device.features.forEach((feature, featureIndex) => {
      const featurePath = `devices[${index}].features[${featureIndex}]`;
      if (feature === null || typeof feature !== 'object') {
        throw badRequest(`${featurePath}: must be an object`);
      }
      if (typeof feature.external_id !== 'string' || !feature.external_id.startsWith(prefix)) {
        throw badRequest(`${featurePath}.external_id: must start with "${prefix}"`);
      }
      if (!CATEGORIES.includes(feature.category)) {
        throw badRequest(`${featurePath}.category: unknown category`);
      }
      if (!TYPES.includes(feature.type)) {
        throw badRequest(`${featurePath}.type: unknown type`);
      }
      if (feature.unit !== undefined && feature.unit !== null && !UNITS.includes(feature.unit)) {
        throw badRequest(`${featurePath}.unit: unknown unit`);
      }
    });
  });
};

/**
 * @description Check a POST /state body like the Gladys core does (saveStates).
 * @param {string} prefix - External id prefix of the integration: `ext:<selector>:`.
 * @param {Array} states - Published states.
 * @example
 * validateStates('ext:demo:', states);
 */
const validateStates = (prefix, states) => {
  states.forEach((state, index) => {
    if (state === null || typeof state !== 'object') {
      throw badRequest(`states[${index}]: must be an object`);
    }
    if (typeof state.device_feature_external_id !== 'string' || !state.device_feature_external_id.startsWith(prefix)) {
      throw badRequest(`states[${index}].device_feature_external_id: must start with "${prefix}"`);
    }
    const hasNumericState = typeof state.state === 'number' && Number.isFinite(state.state);
    if (!hasNumericState && typeof state.text !== 'string') {
      throw badRequest(`states[${index}]: must have a numeric "state" or a string "text"`);
    }
    if (
      state.created_at !== undefined &&
      (typeof state.created_at !== 'string' || Number.isNaN(Date.parse(state.created_at)))
    ) {
      throw badRequest(`states[${index}].created_at: must be an ISO 8601 date string`);
    }
  });
};

/**
 * In-memory Gladys behind a fake integration: the data the host API serves,
 * the record of what it received, and Gladys' side of the WebSocket. Exposed
 * as `gladys.fake`.
 */
class FakeGladys {
  /**
   * @description Build the fake Gladys of one fake integration.
   * @param {object} client - The fake integration.
   * @param {object} options - Options of createFakeGladys.
   * @example
   * this.fake = new FakeGladys(this, options);
   */
  constructor(client, options) {
    this.client = client;
    // Data served by the host API — editable at any time by the test.
    this.devices = toWire(options.devices || []);
    this.config = toWire(options.config || {});
    this.houses = toWire(options.houses || []);
    this.containers = toWire(options.containers || []);
    this.contacts = toWire(options.contacts || []);
    this.webhooks = toWire(options.webhooks || { available: false, webhooks: [] });
    this.scanResults = toWire(options.scanResults || {});
    this.linkedUser = toWire(options.linkedUser || { selector: 'john', first_name: 'John', language: 'en' });
    this.status = toWire(
      options.status || {
        gladys_version: 'v4.86.0',
        service: { id: 'fake-service-id', selector: client.selector, status: 'RUNNING', version: '1.0.0' },
      },
    );
    // Every host API request received: { method, path, body, status }.
    this.requests = [];
    // Every WebSocket message sent by the integration: { type, payload }.
    this.wsMessages = [];
    this.messageCount = 0;
  }

  /**
   * @description Answer one host API request, like the Gladys core would.
   * @param {string} method - HTTP method.
   * @param {string} path - Path relative to /api/integration/v1.
   * @param {object} [body] - JSON body, as received.
   * @returns {any} The response body.
   * @example
   * fake.route('GET', '/device');
   */
  route(method, path, body) {
    const prefix = `ext:${this.client.selector}:`;
    switch (`${method} ${path}`) {
      case 'GET /device':
        return this.devices;
      case 'GET /config':
        return { config: this.config };
      case 'POST /config':
        Object.assign(this.config, body.config);
        return { success: true };
      case 'GET /house':
        return this.houses;
      case 'GET /container':
        return { containers: this.containers };
      case 'GET /contact':
        return this.contacts;
      case 'GET /webhook':
        return this.webhooks;
      case 'GET /status':
        return this.status;
      case 'POST /discovered_device':
        validateDiscoveredDevices(prefix, body.devices);
        return { success: true, count: body.devices.length };
      case 'POST /state':
        validateStates(prefix, body.states);
        return { success: true };
      case 'POST /network_discovery/scan':
        return this.scanResults[body.type] || [];
      case 'POST /contact/link':
        this.contacts = [
          ...this.contacts.filter((contact) => contact.contact_id !== body.contact_id),
          {
            contact_id: body.contact_id,
            contact_name: body.contact_name === undefined ? null : body.contact_name,
            linked_at: new Date().toISOString(),
            user: this.linkedUser,
          },
        ];
        return { user: this.linkedUser };
      default:
        // Every other call (camera image, transports, scene event, message,
        // connection status, containers, wake-on-lan…) is recorded only.
        return { success: true };
    }
  }

  /**
   * @description Bodies of the accepted requests to one endpoint, in order.
   * @param {string} method - HTTP method.
   * @param {string} path - Path relative to /api/integration/v1.
   * @returns {Array} The request bodies.
   * @example
   * fake.bodies('POST', '/state');
   */
  bodies(method, path) {
    return this.requests
      .filter((request) => request.method === method && request.path === path && request.status === 200)
      .map((request) => request.body);
  }

  /** @returns {Array} Every published state: `{ device_feature_external_id, state|text, created_at? }`. */
  get states() {
    return this.bodies('POST', '/state').flatMap((body) => body.states);
  }

  /** @returns {Array} The last published list of discovered devices (each publication replaces the previous one). */
  get discoveredDevices() {
    const bodies = this.bodies('POST', '/discovered_device');
    return bodies.length === 0 ? [] : bodies[bodies.length - 1].devices;
  }

  /** @returns {Array} Every published connection status: `{ connected, message? }`. */
  get connectionStatuses() {
    return this.bodies('POST', '/connection_status');
  }

  /** @returns {object|null} The last published connection status, null if none. */
  get connectionStatus() {
    const statuses = this.connectionStatuses;
    return statuses.length === 0 ? null : statuses[statuses.length - 1];
  }

  /** @returns {Array} Every published transport entry: `{ device_external_id, transport, degraded?, message? }`. */
  get transports() {
    return this.bodies('POST', '/device/transport').flatMap((body) => body.transports);
  }

  /** @returns {Array} Every published camera image: `{ device_external_id, image }`. */
  get cameraImages() {
    return this.bodies('POST', '/camera/image');
  }

  /** @returns {Array} Every fired scene event: `{ key, data }`. */
  get sceneEvents() {
    return this.bodies('POST', '/scene/event');
  }

  /** @returns {Array} Every published channel message: `{ contact_id, text, created_at? }`. */
  get messages() {
    return this.bodies('POST', '/message');
  }

  /** @returns {Array} Every network scan request: `{ type, timeout_seconds?, port?, payload_base64? }`. */
  get scans() {
    return this.bodies('POST', '/network_discovery/scan');
  }

  /** @returns {Array} The key of every widget refresh nudge, in order. */
  get widgetRefreshes() {
    return this.wsMessages
      .filter((message) => message.type === EXTERNAL_INTEGRATION.WIDGET_REFRESH)
      .map((message) => message.payload.key);
  }

  /** @returns {number} The number of weather refresh nudges. */
  get weatherRefreshes() {
    return this.wsMessages.filter((message) => message.type === EXTERNAL_INTEGRATION.WEATHER_REFRESH).length;
  }

  /**
   * @description Last value published for a feature.
   * @param {string} featureExternalId - The feature external_id.
   * @returns {number|string|undefined} Its last `state` (its `text` for a text
   * state), undefined if none was published.
   * @example
   * gladys.fake.lastState(ids.feature('temperature')); // 21.5
   */
  lastState(featureExternalId) {
    const states = this.states.filter((state) => state.device_feature_external_id === featureExternalId);
    if (states.length === 0) {
      return undefined;
    }
    const last = states[states.length - 1];
    return last.text === undefined ? last.state : last.text;
  }

  /**
   * @description Send one WebSocket message to the integration, as Gladys
   * would, and wait for it to be handled. The low-level primitive of the
   * other simulation methods.
   * @param {string} type - Message type (WEBSOCKET_MESSAGE_TYPES).
   * @param {object} [payload] - Message payload; a `message_id` is added.
   * @returns {Promise<object|undefined>} The command ack `{ success, data?, error? }`,
   * or undefined for an event (no ack).
   * @example
   * await gladys.fake.send(WEBSOCKET_MESSAGE_TYPES.EXTERNAL_INTEGRATION.SCAN_REQUEST);
   */
  async send(type, payload = {}) {
    this.messageCount += 1;
    const messageId = `fake-message-${this.messageCount}`;
    await this.client._handleMessage(JSON.stringify({ type, payload: { ...payload, message_id: messageId } }));
    const ack = this.wsMessages.find(
      (message) => message.type === EXTERNAL_INTEGRATION.COMMAND_RESULT && message.payload.message_id === messageId,
    );
    if (!ack) {
      return undefined;
    }
    const result = { ...ack.payload };
    delete result.message_id;
    return result;
  }

  // Simulations of Gladys calling the handlers: `fake.<name>(...)` runs the
  // `on<Name>` handler with the same arguments and resolves with the ack.

  /**
   * @description The user actions a feature (onSetValue).
   * @param {object} device - The device.
   * @param {object} deviceFeature - The feature.
   * @param {number|string} value - The value.
   * @returns {Promise<object>} The ack.
   * @example
   * await gladys.fake.setValue(device, device.features[0], 1);
   */
  setValue(device, deviceFeature, value) {
    return this.send(EXTERNAL_INTEGRATION.DEVICE_SET_VALUE, { device, device_feature: deviceFeature, value });
  }

  /**
   * @description The scheduler polls a device (onPoll).
   * @param {object} device - The device.
   * @returns {Promise<object>} The ack.
   * @example
   * await gladys.fake.poll(device);
   */
  poll(device) {
    return this.send(EXTERNAL_INTEGRATION.DEVICE_POLL, { device });
  }

  /**
   * @description Gladys needs a fresh camera image (onGetImage).
   * @param {object} device - The camera device.
   * @returns {Promise<object>} The ack, the image in `data.image`.
   * @example
   * await gladys.fake.getImage(device);
   */
  getImage(device) {
    return this.send(EXTERNAL_INTEGRATION.CAMERA_GET_IMAGE, { device });
  }

  /**
   * @description The user asks for a device scan (onScanRequest).
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.scanRequest();
   */
  scanRequest() {
    return this.send(EXTERNAL_INTEGRATION.SCAN_REQUEST);
  }

  /**
   * @description The user creates a device (onDeviceCreated); it is also
   * added to the devices served by the host API.
   * @param {object} device - The device.
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
   */
  deviceCreated(device) {
    this.upsertDevice(device);
    return this.send(EXTERNAL_INTEGRATION.DEVICE_CREATED, { device });
  }

  /**
   * @description The user updates a device (onDeviceUpdated); it is also
   * replaced in the devices served by the host API.
   * @param {object} device - The device.
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.deviceUpdated({ ...device, name: 'Renamed' });
   */
  deviceUpdated(device) {
    this.upsertDevice(device);
    return this.send(EXTERNAL_INTEGRATION.DEVICE_UPDATED, { device });
  }

  /**
   * @description The user deletes a device (onDeviceDeleted); it is also
   * removed from the devices served by the host API.
   * @param {object} device - The device.
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.deviceDeleted(device);
   */
  deviceDeleted(device) {
    this.devices = this.devices.filter((d) => d.external_id !== device.external_id);
    return this.send(EXTERNAL_INTEGRATION.DEVICE_DELETED, { device });
  }

  /**
   * @description The user saves the configuration form (onConfigUpdated); it
   * also becomes the configuration served by the host API.
   * @param {object} config - The complete new configuration values.
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.configUpdated({ api_key: 'new-key' });
   */
  configUpdated(config) {
    this.config = toWire(config);
    return this.send(EXTERNAL_INTEGRATION.CONFIG_UPDATED, { config });
  }

  /**
   * @description The user changes the hardware grants (onHardwareUpdated).
   * @param {Array} containers - `[{ name, devices: [{ class, granted, available }] }]`.
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.hardwareUpdated([{ name: 'frigate', devices: [] }]);
   */
  hardwareUpdated(containers) {
    return this.send(EXTERNAL_INTEGRATION.HARDWARE_UPDATED, { containers });
  }

  /**
   * @description The user clicks "Connect" on an oauth2/account_link field (onOAuthAuthorizeUrl).
   * @param {string} key - Config field key.
   * @param {string} [redirectUri] - Redirect URI (undefined for account_link).
   * @returns {Promise<object>} The ack, the URL in `data.authorize_url`.
   * @example
   * await gladys.fake.oauthAuthorizeUrl('account', 'https://gladys.local/oauth');
   */
  oauthAuthorizeUrl(key, redirectUri) {
    return this.send(EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL, { key, redirect_uri: redirectUri });
  }

  /**
   * @description The OAuth2 provider redirects back (onOAuthCallback).
   * @param {string} key - Config field key.
   * @param {object} params - `{ code, state, redirectUri }`.
   * @returns {Promise<object>} The ack.
   * @example
   * await gladys.fake.oauthCallback('account', { code: 'abc', state: 'xyz', redirectUri });
   */
  oauthCallback(key, { code, state, redirectUri } = {}) {
    return this.send(EXTERNAL_INTEGRATION.OAUTH_CALLBACK, { key, code, state, redirect_uri: redirectUri });
  }

  /**
   * @description Gladys delivers a message in the channel (onSendMessage).
   * @param {object} contact - The resolved contact identity.
   * @param {object} message - `{ text, file }`.
   * @returns {Promise<object>} The ack.
   * @example
   * await gladys.fake.sendMessage({ id: '12345' }, { text: 'Hello', file: null });
   */
  sendMessage(contact, message) {
    return this.send(EXTERNAL_INTEGRATION.MESSAGE_SEND, { contact, message });
  }

  /**
   * @description Gladys asks for the weather (onWeatherGet).
   * @param {object} options - `{ latitude, longitude, language, units }`.
   * @returns {Promise<object>} The ack, the weather in `data.weather`.
   * @example
   * await gladys.fake.weatherGet({ latitude: 48.8, longitude: 2.3, language: 'en', units: 'metric' });
   */
  weatherGet(options) {
    return this.send(EXTERNAL_INTEGRATION.WEATHER_GET, { options });
  }

  /**
   * @description Gladys asks for a weather provider image (onWeatherGetImage).
   * @param {string} key - Image key.
   * @returns {Promise<object>} The ack, the image in `data.image`.
   * @example
   * await gladys.fake.weatherGetImage('vigilance-map');
   */
  weatherGetImage(key) {
    return this.send(EXTERNAL_INTEGRATION.WEATHER_GET_IMAGE, { key });
  }

  /**
   * @description Gladys Plus relays a webhook call (onWebhook).
   * @param {string} key - Webhook key.
   * @param {object} [request] - `{ method, query, body, contentType }`.
   * @param {object} [options] - Options.
   * @param {string} [options.mode] - 'fire_and_forget' (default, no ack) or 'sync'.
   * @returns {Promise<object|undefined>} The ack in sync mode.
   * @example
   * await gladys.fake.webhook('events', { method: 'POST', body: '{}' });
   */
  webhook(key, request = {}, { mode = 'fire_and_forget' } = {}) {
    const type = mode === 'sync' ? EXTERNAL_INTEGRATION.WEBHOOK_REQUEST : EXTERNAL_INTEGRATION.WEBHOOK_RECEIVED;
    return this.send(type, {
      webhook_key: key,
      method: request.method,
      query: request.query,
      body: request.body,
      content_type: request.contentType,
    });
  }

  /**
   * @description The Gladys Plus webhook availability changes
   * (onWebhookUpdated); it also becomes the state served by getWebhooks.
   * @param {object} webhooks - `{ available, webhooks: [{ key, mode, url }] }`.
   * @returns {Promise<void>} Resolves once handled.
   * @example
   * await gladys.fake.webhookUpdated({ available: false, webhooks: [] });
   */
  webhookUpdated(webhooks) {
    this.webhooks = toWire(webhooks);
    return this.send(EXTERNAL_INTEGRATION.WEBHOOK_UPDATED, webhooks);
  }

  /**
   * @description The user clicks a manifest action button (onAction).
   * @param {string} key - Action key.
   * @param {object} [fields] - Values of the action fields.
   * @returns {Promise<object>} The ack, the message in `data.message`.
   * @example
   * await gladys.fake.action('test_connection', {});
   */
  action(key, fields = {}) {
    return this.send(EXTERNAL_INTEGRATION.ACTION_RUN, { key, fields });
  }

  /**
   * @description A scene reaches one of the integration scene actions (onSceneAction).
   * @param {string} key - Scene action key.
   * @param {object} [fields] - Resolved fields.
   * @returns {Promise<object>} The ack, the outputs in `data.outputs`.
   * @example
   * await gladys.fake.sceneAction('create_snapshot', { camera: ids.device });
   */
  sceneAction(key, fields = {}) {
    return this.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { key, fields });
  }

  /**
   * @description A dashboard shows a widget (onWidgetGet).
   * @param {string} key - Widget key.
   * @param {object} [options] - `{ settings, language, units }`.
   * @returns {Promise<object>} The ack, the content in `data.content`.
   * @example
   * await gladys.fake.widgetGet('vacuum', { settings: {}, language: 'en', units: 'metric' });
   */
  widgetGet(key, { settings = {}, language = 'en', units = 'metric' } = {}) {
    return this.send(EXTERNAL_INTEGRATION.WIDGET_GET, { key, settings, language, units });
  }

  /**
   * @description Gladys needs the bytes of a widget image (onWidgetGetImage).
   * @param {string} imageKey - Image key.
   * @returns {Promise<object>} The ack, the image in `data.image`.
   * @example
   * await gladys.fake.widgetGetImage('poster-1');
   */
  widgetGetImage(imageKey) {
    return this.send(EXTERNAL_INTEGRATION.WIDGET_GET_IMAGE, { image_key: imageKey });
  }

  /**
   * @description The user taps a widget button (onWidgetAction).
   * @param {string} key - Widget key.
   * @param {string} actionKey - Action key of the button.
   * @param {object} [params] - Params declared in the content.
   * @param {object} [options] - `{ settings }`.
   * @returns {Promise<object>} The ack, the message in `data.message`.
   * @example
   * await gladys.fake.widgetAction('vacuum', 'start', {}, { settings: {} });
   */
  widgetAction(key, actionKey, params = {}, { settings = {} } = {}) {
    return this.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { key, action_key: actionKey, params, settings });
  }

  /**
   * @description The supervisor stops the container: run the handleShutdown
   * cleanup (if registered) with the signal, then disconnect — without
   * exiting the process.
   * @param {string} [signal] - 'SIGTERM' (default) or 'SIGINT'.
   * @returns {Promise<void>} Resolves once shut down.
   * @example
   * await gladys.fake.shutdown();
   */
  async shutdown(signal = 'SIGTERM') {
    if (this.client.shutdownCleanup) {
      await this.client.shutdownCleanup(signal);
    }
    await this.client.disconnect();
  }

  /**
   * @description Insert or replace a device in the devices served by the host API.
   * @param {object} device - The device.
   * @example
   * this.upsertDevice(device);
   */
  upsertDevice(device) {
    this.devices = [...this.devices.filter((d) => d.external_id !== device.external_id), toWire(device)];
  }
}

/**
 * GladysIntegration bound to an in-memory FakeGladys instead of the network.
 */
class FakeGladysIntegration extends GladysIntegration {
  /**
   * @description Build the fake integration client.
   * @param {object} options - Options of createFakeGladys.
   * @example
   * new FakeGladysIntegration({ selector: 'demo' });
   */
  constructor(options) {
    super({
      // .invalid never resolves: nothing can leave the process by mistake.
      hostApiUrl: 'http://fake-gladys.invalid',
      token: 'fake-integration-token',
      selector: options.selector || 'test-integration',
      logger: options.logger || createLogger({ level: 'silent' }),
    });
    this.shutdownCleanup = null;
    this.fake = new FakeGladys(this, options);
    const { fake } = this;
    const request = async (method, path, body) => {
      const wireBody = toWire(body);
      const record = { method, path, body: wireBody, status: 200 };
      fake.requests.push(record);
      try {
        return toWire(fake.route(method, path, wireBody));
      } catch (e) {
        record.status = e.status;
        throw e;
      }
    };
    this.httpClient = {
      get: (path) => request('GET', path),
      post: (path, body) => request('POST', path, body),
    };
  }

  /**
   * @description Resynchronize from the fake Gladys (GET /device + GET /config),
   * mark the client connected, then emit 'connected' and wait for its
   * listeners — so a test can assert what they published right after
   * `await gladys.connect()`.
   * @returns {Promise<void>} Resolves once the 'connected' listeners settled.
   * @example
   * await gladys.connect();
   */
  async connect() {
    await this.getDevices();
    await this.getConfig();
    this.connected = true;
    await this._emitAndWait('connected');
  }

  /**
   * @description Mark the client disconnected, then emit 'disconnected' and
   * wait for its listeners.
   * @returns {Promise<void>} Resolves once the 'disconnected' listeners settled.
   * @example
   * await gladys.disconnect();
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    await this._emitAndWait('disconnected');
  }

  /**
   * @description Remember the cleanup for `gladys.fake.shutdown()` instead of
   * listening to the process signals.
   * @param {Function} [cleanup] - `(signal) => Promise`.
   * @example
   * gladys.handleShutdown(async () => stopPolling());
   */
  handleShutdown(cleanup) {
    this.shutdownCleanup = cleanup || null;
  }

  /**
   * @description Call the listeners of an event and wait for the promises
   * they return (an async listener error rejects).
   * @param {string} event - Event name.
   * @returns {Promise<void>} Resolves once every listener settled.
   * @example
   * await this._emitAndWait('connected');
   */
  async _emitAndWait(event) {
    await Promise.all(this.rawListeners(event).map((listener) => listener.call(this)));
  }

  /**
   * @description Run an event handler, letting its error reject — the real
   * client swallows it (events have no ack), a test wants to see it.
   * @param {string} name - Handler name.
   * @param {Array} args - Arguments passed to the handler.
   * @example
   * await this._runHandler('scanRequest', []);
   */
  async _runHandler(name, args) {
    const handler = this.handlers[name];
    if (handler) {
      await handler(...args);
    }
  }

  /**
   * @description Record an outgoing WebSocket message (command acks, refresh
   * nudges), connected or not.
   * @param {string} type - Message type.
   * @param {object} payload - Message payload.
   * @example
   * this._send('external-integration.widget.refresh', { key: 'vacuum' });
   */
  _send(type, payload) {
    this.fake.wsMessages.push({ type, payload: toWire(payload) });
  }
}

/**
 * @description Create a fake Gladys for the integration's unit tests: a real
 * GladysIntegration (same methods, same checks, same payload mapping) bound
 * to an in-memory Gladys instead of the network. Pass it to the code under
 * test in place of `new GladysIntegration()`. `gladys.fake` holds the data
 * the host API serves, the record of what Gladys received and the
 * simulations of Gladys' calls (`gladys.fake.poll(device)` runs the onPoll
 * handler and resolves with its ack, and so on for every handler).
 * @param {object} [options] - Options.
 * @param {string} [options.selector] - Integration selector (default: 'test-integration').
 * @param {Array} [options.devices] - Devices created by the user (GET /device).
 * @param {object} [options.config] - Configuration values (GET /config).
 * @param {Array} [options.houses] - Houses (GET /house).
 * @param {Array} [options.containers] - Sub-containers (GET /container).
 * @param {Array} [options.contacts] - Linked contacts (GET /contact).
 * @param {object} [options.webhooks] - Webhook state (GET /webhook).
 * @param {object} [options.scanResults] - Raw results per scan type, e.g. `{ mdns: [...] }`.
 * @param {object} [options.linkedUser] - User returned by linkContact.
 * @param {object} [options.status] - GET /status response.
 * @param {object} [options.logger] - SDK logger (default: silent).
 * @returns {GladysIntegration} The fake integration client, with `fake`.
 * @example
 * const gladys = createFakeGladys({ config: { api_key: 'key' } });
 * registerHandlers(gladys); // your code
 * await gladys.connect();
 * await gladys.fake.poll(device);
 * assert.equal(gladys.fake.lastState(ids.feature('temperature')), 21.5);
 */
const createFakeGladys = (options = {}) => new FakeGladysIntegration(options);

module.exports = { createFakeGladys };
