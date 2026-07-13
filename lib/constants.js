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
    HEARTBEAT: 'external-integration.heartbeat',
  },
};

// Close code sent by Gladys when the integration token is refused.
const INVALID_ACCESS_TOKEN_CLOSE_CODE = 4000;

// POST /state accepts at most 100 states per request (contract C.3).
const MAX_STATES_PER_REQUEST = 100;

// Reconnection backoff: min(base * 2^attempt, max) (contract C.8).
const DEFAULT_RECONNECT_BASE_DELAY = 1000;
const DEFAULT_RECONNECT_MAX_DELAY = 60 * 1000;

module.exports = {
  API_PREFIX,
  WEBSOCKET_MESSAGE_TYPES,
  INVALID_ACCESS_TOKEN_CLOSE_CODE,
  MAX_STATES_PER_REQUEST,
  DEFAULT_RECONNECT_BASE_DELAY,
  DEFAULT_RECONNECT_MAX_DELAY,
};
