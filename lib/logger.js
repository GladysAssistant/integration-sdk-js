/**
 * Standard integration logger — tiny and dependency-free.
 *
 * Integration logs are captured by the Gladys supervisor through the container
 * stdout/stderr, so writing to the console is the whole job: debug/info go to
 * stdout, warn/error to stderr. The level is read from the LOG_LEVEL
 * environment variable (debug | info | warn | error | silent,
 * case-insensitive, default: info) unless the `level` option pins it.
 *
 * This logger carries the INTEGRATION's own logs. The SDK also uses it (under
 * the 'gladys-sdk' name, overridable through the `logger` constructor option)
 * for the connection lifecycle: connections, disconnections, reconnection
 * attempts and authentication failures are logged so connectivity problems
 * are diagnosable without any configuration. Everything else in the SDK stays
 * on the internal debug channel (debug.js), silent unless
 * DEBUG=gladys-integration-sdk is set.
 */

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

/**
 * @description Create a logger. Without a `level` option, the level is
 * re-read from LOG_LEVEL on every call (an unknown value falls back to info).
 * @param {object} [options] - Options.
 * @param {string} [options.name] - Prefix added to every line, e.g. the module name.
 * @param {string} [options.level] - Pinned level, bypassing LOG_LEVEL.
 * @returns {object} Logger with debug/info/warn/error/child.
 * @example
 * const logger = createLogger({ name: 'weather-station' });
 */
const createLogger = (options = {}) => {
  const { name, level } = options;
  if (level !== undefined && LOG_LEVELS[level] === undefined) {
    throw new Error(`createLogger: unknown level "${level}" (expected ${Object.keys(LOG_LEVELS).join(', ')})`);
  }
  const threshold = () => LOG_LEVELS[level || (process.env.LOG_LEVEL || '').toLowerCase()] || LOG_LEVELS.info;
  const line = (lineLevel, args) => {
    if (LOG_LEVELS[lineLevel] < threshold()) {
      return;
    }
    const prefix = `[${new Date().toISOString()}] [${lineLevel.toUpperCase()}]${name ? ` [${name}]` : ''}`;
    // eslint-disable-next-line no-console
    const stream = lineLevel === 'warn' || lineLevel === 'error' ? console.error : console.log;
    stream(prefix, ...args);
  };
  return {
    debug: (...args) => line('debug', args),
    info: (...args) => line('info', args),
    warn: (...args) => line('warn', args),
    error: (...args) => line('error', args),
    child: (childName) => createLogger({ ...options, name: name ? `${name}:${childName}` : childName }),
  };
};

// Shared default logger, enough for most integrations.
const logger = createLogger();

module.exports = { createLogger, logger, LOG_LEVELS };
