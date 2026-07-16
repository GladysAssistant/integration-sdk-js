const NAMESPACE = 'gladys-integration-sdk';

/**
 * @description Return true when SDK debug logging is enabled through the DEBUG env var.
 * @returns {boolean} True when enabled.
 * @example
 * isDebugEnabled();
 */
const isDebugEnabled = () => {
  const debugEnv = process.env.DEBUG || '';
  return debugEnv
    .split(/[\s,]+/)
    .some((namespace) => namespace === NAMESPACE || namespace === '*' || namespace === `${NAMESPACE}:*`);
};

/**
 * @description Log a debug message on stderr when DEBUG=gladys-integration-sdk is set.
 * This channel carries the chatty SDK internals only; connection lifecycle
 * events (connect, disconnect, reconnection, authentication failures) go
 * through the standard logger (logger.js) so they are visible by default.
 * @param {...any} args - Values to log.
 * @example
 * debug('websocket closed', code);
 */
const debug = (...args) => {
  if (isDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.error(`[${NAMESPACE}]`, ...args);
  }
};

module.exports = { debug, NAMESPACE };
