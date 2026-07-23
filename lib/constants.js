/**
 * Contract constants — mirror of the Gladys host API / WebSocket protocol
 * specification (sections C.2–C.4). The SDK depends only on these contracts,
 * never on Gladys code.
 */

const API_PREFIX = '/api/integration/v1';

const WEBSOCKET_MESSAGE_TYPES = {
  AUTHENTICATE: {
    INTEGRATION_REQUEST: 'authenticate.integration-request',
  },
  AUTHENTICATION: {
    CONNECTED: 'authentication.connected',
  },
  EXTERNAL_INTEGRATION: {
    DEVICE_SET_VALUE: 'external-integration.device.set-value',
    DEVICE_POLL: 'external-integration.device.poll',
    COMMAND_RESULT: 'external-integration.command-result',
    SCAN_REQUEST: 'external-integration.scan-request',
    DEVICE_CREATED: 'external-integration.device-created',
    DEVICE_UPDATED: 'external-integration.device-updated',
    DEVICE_DELETED: 'external-integration.device-deleted',
    CONFIG_UPDATED: 'external-integration.config-updated',
    HARDWARE_UPDATED: 'external-integration.hardware-updated',
    OAUTH_GET_AUTHORIZE_URL: 'external-integration.oauth.get-authorize-url',
    OAUTH_CALLBACK: 'external-integration.oauth.callback',
    ACTION_RUN: 'external-integration.action.run',
    CAMERA_GET_IMAGE: 'external-integration.camera.get-image',
    MESSAGE_SEND: 'external-integration.message.send',
    HEARTBEAT: 'external-integration.heartbeat',
  },
};

// Close code sent by Gladys when the integration token is refused.
const INVALID_ACCESS_TOKEN_CLOSE_CODE = 4000;

// POST /state accepts at most 100 states per request (contract C.3).
const MAX_STATES_PER_REQUEST = 100;

// POST /device/transport accepts at most 100 entries per request (contract C.3).
const MAX_TRANSPORTS_PER_REQUEST = 100;

// Each language of the degraded transport message (GLADYS_TRANSPORT_MESSAGE)
// is bounded to 200 characters by the Gladys core (contract C.3).
const MAX_TRANSPORT_MESSAGE_LENGTH = 200;

// POST /camera/image accepts images up to 150 KB, the bound of the Gladys core
// (contract C.3) — measured on the full `image/jpg;base64,...` string.
const MAX_CAMERA_IMAGE_SIZE = 150 * 1024;

// POST /message accepts texts of 1-4096 characters, the bound of the Gladys
// core (contract B.15).
const MAX_MESSAGE_TEXT_LENGTH = 4096;

// Values of the per-device transport status, stored in the reserved
// GLADYS_TRANSPORT device param and rendered as a badge in the Gladys UI
// (contract C.3).
const DEVICE_TRANSPORTS = {
  LOCAL: 'local',
  CLOUD: 'cloud',
  UNREACHABLE: 'unreachable',
};

// Reconnection backoff: min(base * 2^attempt, max) (contract C.8).
const DEFAULT_RECONNECT_BASE_DELAY = 1000;
const DEFAULT_RECONNECT_MAX_DELAY = 60 * 1000;

// Host API requests are aborted past this delay so a slow or unresponsive
// host can never stall connect()/resynchronization indefinitely.
const DEFAULT_REQUEST_TIMEOUT = 15 * 1000;

module.exports = {
  API_PREFIX,
  WEBSOCKET_MESSAGE_TYPES,
  INVALID_ACCESS_TOKEN_CLOSE_CODE,
  MAX_STATES_PER_REQUEST,
  MAX_TRANSPORTS_PER_REQUEST,
  MAX_TRANSPORT_MESSAGE_LENGTH,
  MAX_CAMERA_IMAGE_SIZE,
  MAX_MESSAGE_TEXT_LENGTH,
  DEVICE_TRANSPORTS,
  DEFAULT_RECONNECT_BASE_DELAY,
  DEFAULT_RECONNECT_MAX_DELAY,
  DEFAULT_REQUEST_TIMEOUT,
};
