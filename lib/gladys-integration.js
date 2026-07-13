const { EventEmitter } = require('events');
const WebSocket = require('ws');

const { computeBackoffDelay } = require('./backoff');
const {
  WEBSOCKET_MESSAGE_TYPES,
  INVALID_ACCESS_TOKEN_CLOSE_CODE,
  MAX_STATES_PER_REQUEST,
  DEFAULT_RECONNECT_BASE_DELAY,
  DEFAULT_RECONNECT_MAX_DELAY,
} = require('./constants');
const { debug } = require('./debug');
const { HttpClient } = require('./http-client');

const { AUTHENTICATE, AUTHENTICATION, EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

/**
 * Client of the Gladys host API + integration WebSocket (contracts C.2–C.4).
 *
 * Local state kept by the SDK (refreshed on every (re)connection and by the
 * device-created/updated/deleted and config-updated events): `devices`,
 * `config`, `connected`. Lifecycle is observable through the 'connected' and
 * 'disconnected' events (the class extends EventEmitter).
 */
class GladysIntegration extends EventEmitter {
  /**
   * @description Create the integration client. Every option defaults to the
   * environment variables injected in the integration container (contract C.7),
   * and can be overridden for development outside Docker.
   * @param {object} [options] - Options.
   * @param {string} [options.hostApiUrl] - Host API base URL (default: GLADYS_HOST_API_URL).
   * @param {string} [options.token] - Integration JWT (default: GLADYS_INTEGRATION_TOKEN).
   * @param {string} [options.selector] - Integration selector (default: GLADYS_INTEGRATION_SELECTOR).
   * @param {number} [options.reconnectBaseDelay] - First reconnection delay in ms (default: 1000).
   * @param {number} [options.reconnectMaxDelay] - Reconnection delay cap in ms (default: 60000).
   * @example
   * const gladys = new GladysIntegration();
   */
  constructor(options = {}) {
    super();
    const hostApiUrl = options.hostApiUrl || process.env.GLADYS_HOST_API_URL;
    const token = options.token || process.env.GLADYS_INTEGRATION_TOKEN;
    const selector = options.selector || process.env.GLADYS_INTEGRATION_SELECTOR;
    if (!hostApiUrl) {
      throw new Error('GladysIntegration: missing "hostApiUrl" option (or GLADYS_HOST_API_URL env var)');
    }
    if (!token) {
      throw new Error('GladysIntegration: missing "token" option (or GLADYS_INTEGRATION_TOKEN env var)');
    }
    if (!selector) {
      throw new Error('GladysIntegration: missing "selector" option (or GLADYS_INTEGRATION_SELECTOR env var)');
    }
    this.hostApiUrl = hostApiUrl.replace(/\/+$/, '');
    this.token = token;
    this.selector = selector;
    this.wsUrl = this.hostApiUrl.replace(/^http/, 'ws');
    this.reconnectBaseDelay = options.reconnectBaseDelay || DEFAULT_RECONNECT_BASE_DELAY;
    this.reconnectMaxDelay = options.reconnectMaxDelay || DEFAULT_RECONNECT_MAX_DELAY;
    this.httpClient = new HttpClient(this.hostApiUrl, this.token);
    this.devices = [];
    this.config = {};
    this.connected = false;
    this.handlers = {};
    this.ws = null;
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
  }

  /**
   * @description Build a namespaced external id: `ext:<selector>:<suffix>`.
   * This is the only documented way to build an external_id.
   * @param {string} suffix - Integration-chosen identifier suffix.
   * @returns {string} The prefixed external id.
   * @example
   * gladys.externalId('switch:binary'); // 'ext:my-integration:switch:binary'
   */
  externalId(suffix) {
    return `ext:${this.selector}:${suffix}`;
  }

  /**
   * @description Register the handler called when the user actions a device
   * feature. Resolving acks the command with success; throwing acks it as failed
   * with the error message.
   * @param {Function} callback - `(device, deviceFeature, value) => Promise`.
   * @example
   * gladys.onSetValue(async (device, feature, value) => {});
   */
  onSetValue(callback) {
    this.handlers.setValue = callback;
  }

  /**
   * @description Register the handler called when the Gladys scheduler asks to
   * poll a device (devices published with a poll_frequency). Respond by
   * publishing states through publishState/publishStates.
   * @param {Function} callback - `(device) => Promise`.
   * @example
   * gladys.onPoll(async (device) => {});
   */
  onPoll(callback) {
    this.handlers.poll = callback;
  }

  /**
   * @description Register the handler called when the user asks for a device
   * scan from the Discovery screen. Respond through publishDiscoveredDevices.
   * @param {Function} callback - `() => Promise`.
   * @example
   * gladys.onScanRequest(async () => {});
   */
  onScanRequest(callback) {
    this.handlers.scanRequest = callback;
  }

  /**
   * @description Register the handler called when the user creates one of the
   * discovered devices in the Gladys UI.
   * @param {Function} callback - `(device) => Promise`.
   * @example
   * gladys.onDeviceCreated(async (device) => {});
   */
  onDeviceCreated(callback) {
    this.handlers.deviceCreated = callback;
  }

  /**
   * @description Register the handler called when the user updates one of the
   * integration devices in the Gladys UI.
   * @param {Function} callback - `(device) => Promise`.
   * @example
   * gladys.onDeviceUpdated(async (device) => {});
   */
  onDeviceUpdated(callback) {
    this.handlers.deviceUpdated = callback;
  }

  /**
   * @description Register the handler called when the user deletes one of the
   * integration devices in the Gladys UI.
   * @param {Function} callback - `(device) => Promise`.
   * @example
   * gladys.onDeviceDeleted(async (device) => {});
   */
  onDeviceDeleted(callback) {
    this.handlers.deviceDeleted = callback;
  }

  /**
   * @description Register the handler called when the user saves the
   * configuration form. Receives the complete new configuration values.
   * @param {Function} callback - `(config) => Promise`.
   * @example
   * gladys.onConfigUpdated(async (config) => {});
   */
  onConfigUpdated(callback) {
    this.handlers.configUpdated = callback;
  }

  /**
   * @description Open the WebSocket, authenticate, resynchronize local state
   * (GET /device + GET /config), then resolve. Reconnects automatically for
   * life with an exponential backoff of min(1s * 2^n, 60s); every reconnection
   * re-authenticates and resynchronizes. Rejects only when Gladys refuses the
   * token on the very first connection.
   * @returns {Promise<void>} Resolves once authenticated and resynchronized.
   * @example
   * await gladys.connect();
   */
  async connect() {
    this.shouldReconnect = true;
    return new Promise((resolve, reject) => {
      const initial = {
        settled: false,
        resolve: () => {
          if (!initial.settled) {
            initial.settled = true;
            resolve();
          }
        },
        reject: (error) => {
          if (!initial.settled) {
            initial.settled = true;
            reject(error);
          }
        },
      };
      this._openWebSocket(initial);
    });
  }

  /**
   * @description Close the connection cleanly and stop reconnecting.
   * @returns {Promise<void>} Resolves once the socket is closed.
   * @example
   * await gladys.disconnect();
   */
  async disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connected = false;
      return;
    }
    await new Promise((resolve) => {
      this.ws.once('close', resolve);
      this.ws.close(1000);
    });
  }

  /**
   * @description Publish the complete list of discovered devices (replaces the
   * previous one). Devices are shown in the Discovery screen of the Gladys UI,
   * where the user creates them.
   * @param {Array} devices - Devices in the standard Gladys format.
   * @returns {Promise<object>} `{ success, count }`.
   * @example
   * await gladys.publishDiscoveredDevices([{ name: 'Sensor', external_id: gladys.externalId('sensor'), features: [] }]);
   */
  async publishDiscoveredDevices(devices) {
    return this.httpClient.post('/discovered_device', { devices });
  }

  /**
   * @description Fetch the integration devices actually created by the user,
   * and refresh `gladys.devices`.
   * @returns {Promise<Array>} The devices.
   * @example
   * const devices = await gladys.getDevices();
   */
  async getDevices() {
    const devices = await this.httpClient.get('/device');
    this.devices = devices;
    return devices;
  }

  /**
   * @description Publish one device feature state. `value` is a number, or
   * `{ text }` for a text state, or `{ state, created_at }` for a past state.
   * @param {string} featureExternalId - The feature external_id.
   * @param {number|object} value - The state value.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.publishState(gladys.externalId('sensor:temperature'), 21.5);
   */
  async publishState(featureExternalId, value) {
    const state = { device_feature_external_id: featureExternalId };
    if (value !== null && typeof value === 'object') {
      if (value.text !== undefined) {
        state.text = value.text;
      }
      if (value.state !== undefined) {
        state.state = value.state;
      }
      if (value.created_at !== undefined) {
        state.created_at = value.created_at;
      }
    } else {
      state.state = value;
    }
    return this.publishStates([state]);
  }

  /**
   * @description Publish a batch of device feature states (max 100 per request,
   * contract C.3).
   * @param {Array} states - States: `{ device_feature_external_id, state|text, created_at? }`.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.publishStates([{ device_feature_external_id: 'ext:demo:sensor:temperature', state: 21.5 }]);
   */
  async publishStates(states) {
    if (!Array.isArray(states)) {
      throw new Error('publishStates: "states" must be an array');
    }
    if (states.length > MAX_STATES_PER_REQUEST) {
      throw new Error(`publishStates: maximum ${MAX_STATES_PER_REQUEST} states per request`);
    }
    return this.httpClient.post('/state', { states });
  }

  /**
   * @description Fetch the integration configuration (all values, secrets
   * included), and refresh `gladys.config`.
   * @returns {Promise<object>} The configuration values.
   * @example
   * const config = await gladys.getConfig();
   */
  async getConfig() {
    const { config } = await this.httpClient.get('/config');
    this.config = config;
    return config;
  }

  /**
   * @description Save configuration values (partial merge). Keys outside the
   * manifest config_schema are free internal storage, never shown in the UI.
   * @param {object} partialConfig - Keys/values to merge.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.setConfig({ pairing_state: 'done' });
   */
  async setConfig(partialConfig) {
    return this.httpClient.post('/config', { config: partialConfig });
  }

  /**
   * @description Fetch the Gladys version and the integration service status.
   * @returns {Promise<object>} `{ gladys_version, service }`.
   * @example
   * const status = await gladys.getStatus();
   */
  async getStatus() {
    return this.httpClient.get('/status');
  }

  /**
   * @description Open a WebSocket connection and authenticate. `initial` holds
   * the resolve/reject of the connect() promise until the first successful
   * connection.
   * @param {object} initial - Settling wrapper of the connect() promise.
   * @example
   * this._openWebSocket({ resolve, reject });
   */
  _openWebSocket(initial) {
    this.reconnectTimer = null;
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.on('open', () => {
      debug('websocket open, authenticating');
      this._send(AUTHENTICATE.INTEGRATION_REQUEST, { token: this.token });
    });
    ws.on('message', (data) => {
      this._handleMessage(data, initial).catch((e) => debug('error handling message', e));
    });
    ws.on('error', (error) => {
      debug('websocket error', error.message);
    });
    ws.on('close', (code) => {
      debug('websocket closed', code);
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this.emit('disconnected');
      }
      if (!this.shouldReconnect) {
        return;
      }
      if (!initial.settled && code === INVALID_ACCESS_TOKEN_CLOSE_CODE) {
        // The token was refused on the very first connection: fail fast, the
        // integration is misconfigured (dev outside Docker with a bad JWT...).
        this.shouldReconnect = false;
        initial.reject(new Error(`GladysIntegration: authentication refused by Gladys (close code ${code})`));
        return;
      }
      this._scheduleReconnect(initial);
    });
  }

  /**
   * @description Schedule the next reconnection attempt with exponential backoff.
   * @param {object} initial - Settling wrapper of the connect() promise.
   * @example
   * this._scheduleReconnect(null);
   */
  _scheduleReconnect(initial) {
    const delay = computeBackoffDelay(this.reconnectAttempts, this.reconnectBaseDelay, this.reconnectMaxDelay);
    this.reconnectAttempts += 1;
    debug(`reconnecting in ${delay} ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this._openWebSocket(initial), delay);
  }

  /**
   * @description Handle one incoming WebSocket message.
   * @param {Buffer|string} rawData - Raw message data.
   * @param {object} initial - Settling wrapper of the connect() promise.
   * @example
   * await this._handleMessage(rawData, null);
   */
  async _handleMessage(rawData, initial) {
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch (e) {
      debug('ignoring non-JSON message');
      return;
    }
    const { type, payload = {} } = message || {};
    switch (type) {
      case AUTHENTICATION.CONNECTED:
        await this._handleAuthenticated(initial);
        break;
      case EXTERNAL_INTEGRATION.DEVICE_SET_VALUE:
        await this._runCommand('setValue', payload, [payload.device, payload.device_feature, payload.value]);
        break;
      case EXTERNAL_INTEGRATION.DEVICE_POLL:
        await this._runCommand('poll', payload, [payload.device]);
        break;
      case EXTERNAL_INTEGRATION.SCAN_REQUEST:
        await this._runHandler('scanRequest', []);
        break;
      case EXTERNAL_INTEGRATION.DEVICE_CREATED:
        this._upsertDevice(payload.device);
        await this._runHandler('deviceCreated', [payload.device]);
        break;
      case EXTERNAL_INTEGRATION.DEVICE_UPDATED:
        this._upsertDevice(payload.device);
        await this._runHandler('deviceUpdated', [payload.device]);
        break;
      case EXTERNAL_INTEGRATION.DEVICE_DELETED:
        this._removeDevice(payload.device);
        await this._runHandler('deviceDeleted', [payload.device]);
        break;
      case EXTERNAL_INTEGRATION.CONFIG_UPDATED:
        this.config = payload.config;
        await this._runHandler('configUpdated', [payload.config]);
        break;
      default:
        // Unknown types are ignored silently for forward compatibility (C.4).
        debug('ignoring unknown message type', type);
    }
  }

  /**
   * @description Handle a successful authentication: resynchronize local state,
   * then mark the client connected. A failed resynchronization closes the
   * socket so the standard reconnection path retries.
   * @param {object} initial - Settling wrapper of the connect() promise.
   * @example
   * await this._handleAuthenticated(null);
   */
  async _handleAuthenticated(initial) {
    debug('authenticated, resynchronizing');
    try {
      await this.getDevices();
      await this.getConfig();
    } catch (e) {
      debug('resynchronization failed, retrying through reconnection', e.message);
      this.ws.close(1000);
      return;
    }
    this.reconnectAttempts = 0;
    this.connected = true;
    this.emit('connected');
    initial.resolve();
  }

  /**
   * @description Run a command handler and automatically ack it with a
   * command-result message: resolve → success, throw → failure with the error
   * message, missing handler → failure "not implemented".
   * @param {string} name - Handler name.
   * @param {object} payload - Command payload (carries message_id).
   * @param {Array} args - Arguments passed to the handler.
   * @example
   * await this._runCommand('setValue', payload, [payload.device, payload.device_feature, payload.value]);
   */
  async _runCommand(name, payload, args) {
    const handler = this.handlers[name];
    const messageId = payload.message_id;
    if (!handler) {
      this._send(EXTERNAL_INTEGRATION.COMMAND_RESULT, {
        message_id: messageId,
        success: false,
        error: 'not implemented',
      });
      return;
    }
    try {
      await handler(...args);
      this._send(EXTERNAL_INTEGRATION.COMMAND_RESULT, { message_id: messageId, success: true });
    } catch (e) {
      this._send(EXTERNAL_INTEGRATION.COMMAND_RESULT, { message_id: messageId, success: false, error: e.message });
    }
  }

  /**
   * @description Run an event handler if registered, swallowing its errors
   * (events have no ack).
   * @param {string} name - Handler name.
   * @param {Array} args - Arguments passed to the handler.
   * @example
   * await this._runHandler('scanRequest', []);
   */
  async _runHandler(name, args) {
    const handler = this.handlers[name];
    if (!handler) {
      return;
    }
    try {
      await handler(...args);
    } catch (e) {
      debug(`handler ${name} failed`, e.message);
    }
  }

  /**
   * @description Insert or replace a device in the local `devices` list,
   * matched by external_id.
   * @param {object} device - Device in the standard Gladys format.
   * @example
   * this._upsertDevice(device);
   */
  _upsertDevice(device) {
    this.devices = [...this.devices.filter((d) => d.external_id !== device.external_id), device];
  }

  /**
   * @description Remove a device from the local `devices` list, matched by
   * external_id.
   * @param {object} device - Device in the standard Gladys format.
   * @example
   * this._removeDevice(device);
   */
  _removeDevice(device) {
    this.devices = this.devices.filter((d) => d.external_id !== device.external_id);
  }

  /**
   * @description Send a message on the WebSocket using the standard envelope
   * `{ type, payload }`. Messages are dropped silently when the socket is not
   * open (no queue, contract C.4).
   * @param {string} type - Message type.
   * @param {object} payload - Message payload.
   * @example
   * this._send('external-integration.heartbeat', {});
   */
  _send(type, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      debug('dropping message, websocket not open', type);
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }
}

module.exports = { GladysIntegration };
