const { EventEmitter } = require('events');
const WebSocket = require('ws');

const { computeBackoffDelay } = require('./backoff');
const {
  WEBSOCKET_MESSAGE_TYPES,
  INVALID_ACCESS_TOKEN_CLOSE_CODE,
  MAX_STATES_PER_REQUEST,
  MAX_TRANSPORTS_PER_REQUEST,
  MAX_TRANSPORT_MESSAGE_LENGTH,
  MAX_CAMERA_IMAGE_SIZE,
  MAX_MESSAGE_TEXT_LENGTH,
  MAX_ACTIVE_SCAN_PAYLOAD_SIZE,
  DEVICE_TRANSPORTS,
  DEFAULT_RECONNECT_BASE_DELAY,
  DEFAULT_RECONNECT_MAX_DELAY,
  DEFAULT_REQUEST_TIMEOUT,
} = require('./constants');
const { debug } = require('./debug');
const { describeError } = require('./errors');
const { HttpClient } = require('./http-client');
const { createLogger } = require('./logger');

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
   * @param {number} [options.requestTimeout] - Host API request timeout in ms (default: 15000).
   * @param {object} [options.logger] - Logger used for the connection lifecycle
   * logs (default: `createLogger({ name: 'gladys-sdk' })`). Pass
   * `createLogger({ level: 'silent' })` to silence the SDK entirely.
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
    this.requestTimeout = options.requestTimeout || DEFAULT_REQUEST_TIMEOUT;
    this.logger = options.logger || createLogger({ name: 'gladys-sdk' });
    this.httpClient = new HttpClient(this.hostApiUrl, this.token, this.requestTimeout);
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
   * @description Build the external ids of ONE physical device: its device id
   * and a factory for its feature ids. `platformId` must be the unique id the
   * external platform gives you (serial number, cloud device id, Zigbee IEEE
   * address, MAC…), never a hard-coded label: external ids must stay globally
   * unique and stable across restarts, they are how Gladys matches states to
   * devices.
   * @param {string} type - Device type namespace, e.g. 'weather-station'.
   * @param {string} platformId - Unique id from the external platform.
   * @returns {object} `{ device, feature(featureKey) }`.
   * @example
   * const ids = gladys.externalIds('plug', '0x00158d0001a2b3c4');
   * ids.device; // 'ext:my-integration:plug:0x00158d0001a2b3c4'
   * ids.feature('power'); // 'ext:my-integration:plug:0x00158d0001a2b3c4:power'
   */
  externalIds(type, platformId) {
    const device = this.externalId(`${type}:${platformId}`);
    return {
      device,
      feature: (featureKey) => `${device}:${featureKey}`,
    };
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
   * @description Register the handler called when Gladys needs a FRESH image
   * of one of the integration cameras (live view of the dashboard widget, chat
   * intent "show me the camera"). Capture and resolve the image as an
   * `image/jpg;base64,...` string (≤ 150 KB): it is acked back as `data.image`.
   * The ack is awaited under 15 s (not the standard 5 s) so an ffmpeg-style
   * capture fits; throwing acks the command as failed with the error message.
   * @param {Function} callback - `(device) => Promise<string>`.
   * @example
   * gladys.onGetImage(async (device) => `image/jpg;base64,${await captureJpeg(device)}`);
   */
  onGetImage(callback) {
    this.handlers.getImage = callback;
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
   * @description Register the handler called when the user changes the
   * hardware grants of the sub-containers (contract C.4 `hardware-updated`):
   * the affected sub-containers have been recreated; regenerate their
   * configuration (e.g. `edgetpu` vs `cpu` detector) and (re)start what is
   * needed through startContainer/restartContainer.
   * @param {Function} callback - `(containers) => Promise`, `containers` being
   * `[{ name, devices: [{ class, granted, available }] }]`.
   * @example
   * gladys.onHardwareUpdated(async (containers) => {});
   */
  onHardwareUpdated(callback) {
    this.handlers.hardwareUpdated = callback;
  }

  /**
   * @description Register the handler called when the user clicks "Connect" on
   * an `oauth2` config field. Build and return the provider authorization URL
   * (client_id from the config, scopes, a `state` you generate and remember
   * for the callback). The resolved string is acked back to Gladys as
   * `data.authorize_url` and opened in the user browser.
   * @param {Function} callback - `(key, redirectUri) => Promise<string>`.
   * @example
   * gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => 'https://provider/authorize?...');
   */
  onOAuthAuthorizeUrl(callback) {
    this.handlers.oauthAuthorizeUrl = callback;
  }

  /**
   * @description Register the handler called when the OAuth2 provider
   * redirects back after the user consent. Verify `state`, exchange the code
   * for the tokens, store them through setConfig (keys outside the
   * config_schema), then report through setConnectionStatus(true). Throwing
   * acks the command as failed with the error message.
   * @param {Function} callback - `(key, { code, state, redirectUri }) => Promise`.
   * @example
   * gladys.onOAuthCallback(async (key, { code, state, redirectUri }) => {});
   */
  onOAuthCallback(callback) {
    this.handlers.oauthCallback = callback;
  }

  /**
   * @description Register the handler called when Gladys asks a communication
   * integration (manifest `type: "communication"`, contract B.15) to deliver a
   * message in the external channel — a reply of the brain, or a notification
   * forwarded to a linked user. `message` is `{ text, file }` (`file` is a
   * base64 image or null). Resolving acks the command with success; throwing
   * acks it as failed with the error message.
   * @param {Function} callback - `(contactId, message) => Promise`.
   * @example
   * gladys.onSendMessage(async (contactId, message) => bot.sendMessage(contactId, message.text));
   */
  onSendMessage(callback) {
    this.handlers.sendMessage = callback;
  }

  /**
   * @description Register the handler of ONE action declared in the manifest
   * `actions` field (contract C.1) — connection test, identify, protocol
   * detection… — run when the user clicks its button in the Configuration
   * screen. Registered per action `key`; receives the values of the action
   * `fields` mini-form. The resolved value (a string or a multi-language
   * object) is acked back as `data.message` and shown under the button —
   * throwing shows the error message instead. The ack is awaited under the
   * action's declared `timeout_seconds` (not the standard 5 s), so long
   * operations are fine.
   * @param {string} key - Action key, as declared in the manifest.
   * @param {Function} callback - `(fields) => Promise<string|object>`.
   * @example
   * gladys.onAction('detect_protocol', async (fields) => `Protocol 3.3 detected on ${fields.ip}`);
   */
  onAction(key, callback) {
    this.handlers[`action:${key}`] = callback;
  }

  /**
   * @description Open the WebSocket, authenticate, resynchronize local state
   * (GET /device + GET /config), then resolve. Reconnects automatically for
   * life with an exponential backoff of min(1s * 2^n, 60s); every reconnection
   * re-authenticates and resynchronizes. When Gladys refuses the token (close
   * code 4000) the loop stays armed but jumps straight to the max delay —
   * the refusal may be transient (token validation error at boot) and a live
   * container that stops reconnecting is never recreated by the supervisor.
   * connect() rejects when the refusal happens during the initial connection.
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
   * @description Exit gracefully on SIGTERM/SIGINT (sent by the supervisor
   * when the container stops): run the optional cleanup, disconnect cleanly,
   * then exit with code 0. Cleanup/disconnect errors are swallowed — the
   * process is stopping anyway. Call it once, next to the other handlers.
   * @param {Function} [cleanup] - `(signal) => Promise`, run before disconnecting.
   * @example
   * gladys.handleShutdown(async () => stopPolling());
   */
  handleShutdown(cleanup) {
    const shutdown = async (signal) => {
      debug(`received ${signal}, shutting down`);
      if (cleanup) {
        try {
          await cleanup(signal);
        } catch (e) {
          debug('shutdown cleanup failed', e.message);
        }
      }
      try {
        await this.disconnect();
      } catch (e) {
        debug('disconnect failed during shutdown', e.message);
      }
      process.exit(0);
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
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
   * @description Publish a new image of a camera device of the integration
   * (contract C.3): a device carrying a `camera`/`image` feature, declared
   * like any feature in the discovered devices. The dashboard camera widget
   * updates in real time. Images never go through the states path: dedicated
   * channel, out of the states history and rate limit — but limited to 150 KB
   * and 12 images/minute per device (the continuous video stream is not the
   * scope: this is the periodic snapshot path).
   * @param {string} deviceExternalId - The camera device external_id.
   * @param {string} image - The image, as an `image/jpg;base64,...` string (≤ 150 KB).
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.publishCameraImage(gladys.externalId('cam:abc'), `image/jpg;base64,${jpegBase64}`);
   */
  async publishCameraImage(deviceExternalId, image) {
    if (typeof image !== 'string') {
      throw new Error('publishCameraImage: "image" must be an "image/jpg;base64,..." string');
    }
    if (image.length > MAX_CAMERA_IMAGE_SIZE) {
      throw new Error(`publishCameraImage: maximum image size is ${MAX_CAMERA_IMAGE_SIZE} bytes (150 KB)`);
    }
    return this.httpClient.post('/camera/image', { device_external_id: deviceExternalId, image });
  }

  /**
   * @description Publish the per-device transport status of the integration
   * devices (contract C.3): `'local'`, `'cloud'` or `'unreachable'`, stored in
   * the reserved GLADYS_TRANSPORT device param and rendered as a badge on the
   * devices in the Gladys UI, in real time. This is the lightweight path for
   * live switches (the cloud link drops → 'unreachable', the LAN comes back →
   * 'local') — no need to re-publish the discovered devices. Unknown external
   * ids are ignored silently by Gladys. The matching user preference arrives
   * in `gladys.config.GLADYS_PREFER_LOCAL` (a wish, not an order: apply it
   * when you can, and reflect the per-device reality here).
   *
   * An entry can also carry the degraded state — "it works, but not in the
   * nominal mode", which the three transport values cannot express (field
   * case: device seen by the local scan but local sessions refused → cloud
   * fallback looks like a perfectly normal 'cloud' badge): `degraded: true`
   * plus an optional multi-language `message` (`en` mandatory, ≤ 200
   * characters per language) giving the reason. The badge keeps its transport
   * color with an orange dot overlay, and the tooltip shows the message.
   * Degraded is orthogonal to the transport — "which channel is in use" and
   * "is this the nominal state" are two different pieces of information — and
   * publishing an entry WITHOUT `degraded` explicitly clears a previously
   * published degraded state (back to nominal, no ghost orange dot).
   * @param {Array} transports - Entries: `{ external_id, transport, degraded, message }` (max 100).
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.publishTransports([{ external_id: gladys.externalId('plug:abc'), transport: 'local' }]);
   * @example
   * await gladys.publishTransports([
   *   {
   *     external_id: gladys.externalId('plug:abc'),
   *     transport: 'cloud',
   *     degraded: true,
   *     message: { en: 'Local session refused, falling back to cloud' },
   *   },
   * ]);
   */
  async publishTransports(transports) {
    if (!Array.isArray(transports)) {
      throw new Error('publishTransports: "transports" must be an array');
    }
    if (transports.length > MAX_TRANSPORTS_PER_REQUEST) {
      throw new Error(`publishTransports: maximum ${MAX_TRANSPORTS_PER_REQUEST} transports per request`);
    }
    const validTransports = Object.values(DEVICE_TRANSPORTS);
    const entries = transports.map((entry) => {
      const deviceExternalId = entry.external_id || entry.device_external_id;
      if (!deviceExternalId) {
        throw new Error('publishTransports: every entry must carry an "external_id"');
      }
      if (!validTransports.includes(entry.transport)) {
        throw new Error(`publishTransports: "transport" must be one of ${validTransports.join(', ')}`);
      }
      if (entry.degraded !== undefined && typeof entry.degraded !== 'boolean') {
        throw new Error('publishTransports: "degraded" must be a boolean');
      }
      if (entry.message !== undefined && entry.degraded !== true) {
        throw new Error('publishTransports: "message" is only taken into account when "degraded" is true');
      }
      const mapped = { device_external_id: deviceExternalId, transport: entry.transport };
      if (entry.degraded === true) {
        mapped.degraded = true;
        if (entry.message !== undefined) {
          const { message } = entry;
          // Only own enumerable properties survive the JSON serialization, so
          // an inherited "en" (Object.create) would reach Gladys as {} → 400.
          if (
            typeof message !== 'object' ||
            message === null ||
            Array.isArray(message) ||
            !Object.prototype.propertyIsEnumerable.call(message, 'en') ||
            typeof message.en !== 'string' ||
            !message.en
          ) {
            throw new Error('publishTransports: "message" must be a multi-language object with a mandatory "en" key');
          }
          for (const text of Object.values(message)) {
            if (typeof text !== 'string' || text.length > MAX_TRANSPORT_MESSAGE_LENGTH) {
              throw new Error(
                `publishTransports: every "message" language must be a string of at most ${MAX_TRANSPORT_MESSAGE_LENGTH} characters`,
              );
            }
          }
          mapped.message = message;
        }
      }
      return mapped;
    });
    return this.httpClient.post('/device/transport', { transports: entries });
  }

  /**
   * @description Publish a message received in the external channel (contract
   * B.15, communication integrations): Gladys resolves the contact to the
   * linked user, then routes the message to the brain, the chat history and
   * the answering machinery — replies come back through the onSendMessage
   * handler. An incoming message carries the authority of the linked user, so
   * the contact MUST have linked their account first (linkContact): an unknown
   * contact is rejected with a 404 `GladysApiError`, and the integration
   * should then answer in the channel "account not linked, code required".
   * @param {string} contactId - Id of the contact in the external channel.
   * @param {string} text - Text of the message (1-4096 characters).
   * @param {object} [options] - Options.
   * @param {string|Date} [options.createdAt] - ISO date of the message, for
   * messages received while the integration was offline.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.publishMessage('12345', 'Turn on the light');
   */
  async publishMessage(contactId, text, options = {}) {
    if (typeof contactId !== 'string' || contactId.length === 0) {
      throw new Error('publishMessage: "contactId" must be a non-empty string');
    }
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('publishMessage: "text" must be a non-empty string');
    }
    if (text.length > MAX_MESSAGE_TEXT_LENGTH) {
      throw new Error(`publishMessage: maximum text length is ${MAX_MESSAGE_TEXT_LENGTH} characters`);
    }
    const body = { contact_id: contactId, text };
    if (options.createdAt !== undefined) {
      body.created_at = options.createdAt instanceof Date ? options.createdAt.toISOString() : options.createdAt;
    }
    return this.httpClient.post('/message', body);
  }

  /**
   * @description Link an external contact to a Gladys user (contract B.15,
   * communication integrations). The code proves the consent: the user
   * generates it from the integration page in the Gladys UI (single use,
   * 15 minutes TTL), then sends it to the bot in the external channel — the
   * integration relays it here with the channel identity of the sender.
   * Resolves with the linked Gladys user, e.g. to greet them in the channel;
   * an invalid or expired code is rejected with a 404 `GladysApiError`.
   * @param {string} code - The short code typed by the contact in the channel.
   * @param {string} contactId - Id of the contact in the external channel.
   * @param {string} [contactName] - Display name of the contact, shown in the
   * Gladys UI next to the linked user.
   * @returns {Promise<object>} The linked user: `{ selector, first_name, language }`.
   * @example
   * const user = await gladys.linkContact('AB23CD45', '12345', 'John');
   */
  async linkContact(code, contactId, contactName) {
    if (typeof code !== 'string' || code.length === 0) {
      throw new Error('linkContact: "code" must be a non-empty string');
    }
    if (typeof contactId !== 'string' || contactId.length === 0) {
      throw new Error('linkContact: "contactId" must be a non-empty string');
    }
    const body = { code, contact_id: contactId };
    if (contactName !== undefined) {
      body.contact_name = contactName;
    }
    const { user } = await this.httpClient.post('/contact/link', body);
    return user;
  }

  /**
   * @description Fetch the contacts linked to the integration, with the
   * linked Gladys user of each one (contract B.15, communication
   * integrations) — e.g. to resynchronize the channel-side state after a
   * restart, or to detect that a contact was unlinked by the user from the
   * Gladys UI.
   * @returns {Promise<Array>} The contacts:
   * `[{ contact_id, contact_name, linked_at, user: { selector, first_name, language } }]`.
   * @example
   * const contacts = await gladys.getContacts();
   */
  async getContacts() {
    return this.httpClient.get('/contact');
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
   * Keys of `section` fields (presentational intro blocks, no stored value)
   * are rejected by the host API.
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
   * @description Publish the application-level connection status of the
   * integration (contract C.3), shown in the Configuration screen of the
   * Gladys UI. Distinct from the container state machine: a cloud integration
   * can be RUNNING and still disconnected from its third-party service (e.g.
   * expired OAuth token) — without this channel it would be silently broken.
   * @param {boolean} connected - Whether the integration is connected to its service.
   * @param {object} [message] - Optional multi-language message, e.g.
   * `{ en: 'Token expired, please reconnect.', fr: 'Token expiré.' }`.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.setConnectionStatus(false, { en: 'Token expired, please reconnect.' });
   */
  async setConnectionStatus(connected, message) {
    const body = { connected };
    if (message !== undefined) {
      body.message = message;
    }
    return this.httpClient.post('/connection_status', body);
  }

  /**
   * @description Fetch the sub-containers declared in the manifest: their
   * Docker status, desired state, assigned host ports and, per requested
   * hardware class, the granted/available flags (contract C.3) — how the
   * integration knows what to put in its generated configs.
   * @returns {Promise<Array>} The containers; empty if none is declared.
   * @example
   * const containers = await gladys.getContainers();
   */
  async getContainers() {
    const { containers } = await this.httpClient.get('/container');
    return containers;
  }

  /**
   * @description Create (if needed) and start a sub-container declared in the
   * manifest — typically after generating its config files in `/data`. The
   * container enters the desired state "running" (restarted by the supervisor
   * if it crashes). The optional `env` is merged over the manifest env (keys
   * `GLADYS_*` are rejected); when it differs from the existing container env,
   * the supervisor recreates the container before starting it.
   * @param {string} name - Container name, as declared in the manifest.
   * @param {object} [options] - Options.
   * @param {object} [options.env] - Runtime-computed environment variables.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.startContainer('mqtt', { env: { MQTT_PASSWORD: password } });
   */
  async startContainer(name, options = {}) {
    const body = options.env === undefined ? {} : { env: options.env };
    return this.httpClient.post(`/container/${encodeURIComponent(name)}/start`, body);
  }

  /**
   * @description Stop a sub-container and clear its desired state: the
   * supervisor will not restart it.
   * @param {string} name - Container name, as declared in the manifest.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.stopContainer('mqtt');
   */
  async stopContainer(name) {
    return this.httpClient.post(`/container/${encodeURIComponent(name)}/stop`, {});
  }

  /**
   * @description Restart a sub-container — typically after rewriting one of
   * its config files through `/data` to apply it.
   * @param {string} name - Container name, as declared in the manifest.
   * @returns {Promise<object>} `{ success }`.
   * @example
   * await gladys.restartContainer('frigate');
   */
  async restartContainer(name) {
    return this.httpClient.post(`/container/${encodeURIComponent(name)}/restart`, {});
  }

  /**
   * @description Run an on-demand mediated network scan (contract B.16).
   * Bridge containers never receive LAN broadcast/mDNS/SSDP traffic, so the
   * core — which runs on the host network — captures what the manifest
   * `network_discovery` field declares and returns the RAW results: the core
   * captures (network position), the integration interprets (protocol
   * knowledge). Parse the results yourself (e.g. decode the Tuya
   * `payload_base64` announcements), join the devices through unicast (which
   * crosses the NAT), then publish them with publishDiscoveredDevices.
   * Undeclared type/ports are rejected with a 403.
   *
   * 'udp-active-broadcast' is the query/response variant (TP-Link Kasa style):
   * the integration forges the discovery request (`payload`, the protocol
   * crypto stays on the integration side), the core broadcasts it on `port`
   * and relays the raw unicast replies in the same shape as 'udp-broadcast'.
   * Guardrails enforced by the core: broadcast only (never a chosen unicast
   * target), port declared in the manifest, payload of at most 512 decoded
   * bytes, 1 scan per 10 seconds per integration (429 otherwise).
   * @param {string} type - Declared capture type: 'udp-broadcast' |
   * 'udp-active-broadcast' | 'mdns' | 'ssdp'.
   * @param {object} [options] - Options.
   * @param {number} [options.timeoutSeconds] - Scan duration in seconds (1-30).
   * @param {number} [options.port] - 'udp-active-broadcast' only (required): destination
   * UDP port of the broadcast, among the manifest-declared ports.
   * @param {Buffer|string} [options.payload] - 'udp-active-broadcast' only (required):
   * discovery request to broadcast, as a Buffer or an already-base64-encoded
   * string (≤ 512 decoded bytes).
   * @returns {Promise<Array>} Raw results — 'udp-broadcast' and
   * 'udp-active-broadcast': `[{ source_ip, source_port, payload_base64 }]`;
   * 'mdns': `[{ name, host, addresses, port, txt }]`; 'ssdp': raw headers per
   * responder.
   * @example
   * const results = await gladys.scanNetwork('udp-broadcast', { timeoutSeconds: 10 });
   * @example
   * const replies = await gladys.scanNetwork('udp-active-broadcast', {
   *   port: 9999,
   *   payload: encryptKasaDiscoveryRequest(), // your protocol code, returns a Buffer
   *   timeoutSeconds: 5,
   * });
   */
  async scanNetwork(type, options = {}) {
    const body = { type };
    if (type === 'udp-active-broadcast') {
      if (!Number.isInteger(options.port)) {
        throw new Error('scanNetwork: "port" (a manifest-declared port) is required for a udp-active-broadcast scan');
      }
      let payloadBuffer;
      if (Buffer.isBuffer(options.payload)) {
        payloadBuffer = options.payload;
      } else if (typeof options.payload === 'string' && options.payload.length > 0) {
        payloadBuffer = Buffer.from(options.payload, 'base64');
      } else {
        throw new Error(
          'scanNetwork: "payload" (a Buffer or a base64 string) is required for a udp-active-broadcast scan',
        );
      }
      if (payloadBuffer.length === 0) {
        throw new Error('scanNetwork: "payload" must not be empty');
      }
      if (payloadBuffer.length > MAX_ACTIVE_SCAN_PAYLOAD_SIZE) {
        throw new Error(`scanNetwork: maximum payload size is ${MAX_ACTIVE_SCAN_PAYLOAD_SIZE} decoded bytes`);
      }
      body.port = options.port;
      body.payload_base64 = payloadBuffer.toString('base64');
    }
    if (options.timeoutSeconds !== undefined) {
      body.timeout_seconds = options.timeoutSeconds;
    }
    return this.httpClient.post('/network_discovery/scan', body);
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
      this.logger.error(`websocket error on ${this.wsUrl}: ${describeError(error)}`);
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
      if (wasConnected) {
        this.logger.warn(`connection to Gladys lost (close code ${code})`);
      }
      if (code === INVALID_ACCESS_TOKEN_CLOSE_CODE) {
        // The token was refused. Gladys closes with 4000 for ANY token
        // validation error, including transient ones (DB busy at boot), and
        // the supervisor never recreates a live container that stopped
        // reconnecting (it only turns DEGRADED) — giving up would leave the
        // integration zombie. So the loop stays armed for life, but jumps
        // straight to the max delay: no point hammering the server with a
        // probably-revoked token. connect() still rejects when the refusal
        // happens during the initial connection (fail-fast for dev).
        this.logger.error(
          `authentication refused by Gladys (close code ${code}): the integration token was rejected` +
            ' — check GLADYS_INTEGRATION_TOKEN; the refusal can also be transient (Gladys booting)',
        );
        initial.reject(new Error(`GladysIntegration: authentication refused by Gladys (close code ${code})`));
        this._scheduleReconnect(initial, this.reconnectMaxDelay);
        return;
      }
      this._scheduleReconnect(initial);
    });
  }

  /**
   * @description Schedule the next reconnection attempt with exponential backoff.
   * @param {object} initial - Settling wrapper of the connect() promise.
   * @param {number} [delayOverride] - Forced delay in ms, bypassing the backoff
   * computation (used to jump straight to the max delay after a token refusal).
   * @example
   * this._scheduleReconnect(initial);
   */
  _scheduleReconnect(initial, delayOverride) {
    const delay =
      delayOverride === undefined
        ? computeBackoffDelay(this.reconnectAttempts, this.reconnectBaseDelay, this.reconnectMaxDelay)
        : delayOverride;
    this.reconnectAttempts += 1;
    this.logger.warn(
      `not connected to Gladys (${this.wsUrl}), retrying in ${delay} ms (attempt ${this.reconnectAttempts})`,
    );
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
    } catch {
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
      case EXTERNAL_INTEGRATION.CAMERA_GET_IMAGE:
        await this._runCommand('getImage', payload, [payload.device], (image) => ({ image }));
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
      case EXTERNAL_INTEGRATION.HARDWARE_UPDATED:
        await this._runHandler('hardwareUpdated', [payload.containers]);
        break;
      case EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL:
        await this._runCommand('oauthAuthorizeUrl', payload, [payload.key, payload.redirect_uri], (authorizeUrl) => ({
          authorize_url: authorizeUrl,
        }));
        break;
      case EXTERNAL_INTEGRATION.OAUTH_CALLBACK:
        await this._runCommand('oauthCallback', payload, [
          payload.key,
          { code: payload.code, state: payload.state, redirectUri: payload.redirect_uri },
        ]);
        break;
      case EXTERNAL_INTEGRATION.MESSAGE_SEND:
        await this._runCommand('sendMessage', payload, [payload.contact_id, payload.message]);
        break;
      case EXTERNAL_INTEGRATION.ACTION_RUN:
        await this._runCommand(`action:${payload.key}`, payload, [payload.fields], (result) => ({ message: result }));
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
      this.logger.error(
        `authenticated on the websocket, but the host API resynchronization failed: ${describeError(e)}` +
          ' — reconnecting to retry',
      );
      this.ws.close(1000);
      return;
    }
    this.reconnectAttempts = 0;
    this.connected = true;
    this.logger.info(`connected to Gladys (${this.hostApiUrl})`);
    this.emit('connected');
    initial.resolve();
  }

  /**
   * @description Run a command handler and automatically ack it with a
   * command-result message: resolve → success — and when the resolved value is
   * not `undefined`, it is sent back in `data` (contract C.4, for commands
   * that expect an answer) —, throw → failure with the error message, missing
   * handler → failure "not implemented".
   * @param {string} name - Handler name.
   * @param {object} payload - Command payload (carries message_id).
   * @param {Array} args - Arguments passed to the handler.
   * @param {Function} [mapResult] - Optional mapping of the resolved value to
   * the `data` payload (e.g. wrap the oauth authorize URL in `{ authorize_url }`).
   * @example
   * await this._runCommand('setValue', payload, [payload.device, payload.device_feature, payload.value]);
   */
  async _runCommand(name, payload, args, mapResult) {
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
      const result = await handler(...args);
      const ack = { message_id: messageId, success: true };
      if (result !== undefined) {
        ack.data = mapResult ? mapResult(result) : result;
      }
      this._send(EXTERNAL_INTEGRATION.COMMAND_RESULT, ack);
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
