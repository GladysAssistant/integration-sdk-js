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
 * The SDK never logs anything otherwise: stdout/stderr belong to the integration.
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
