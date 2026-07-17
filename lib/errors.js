/**
 * Error thrown for every non-2xx response of the Gladys host API.
 * Carries the standard Gladys error attributes: { status, code, message }.
 */
class GladysApiError extends Error {
  /**
   * @description Build a GladysApiError from a Gladys host API error response.
   * @param {number} status - HTTP status code.
   * @param {string} code - Gladys error code (e.g. "UNAUTHORIZED", "BAD_REQUEST").
   * @param {string} message - Human readable error message.
   * @example
   * throw new GladysApiError(401, 'UNAUTHORIZED', 'Invalid token');
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'GladysApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * @description Build a one-line human-readable description of an error,
 * surfacing the low-level code (ECONNREFUSED, ETIMEDOUT…) that Node.js often
 * hides behind a generic message ("fetch failed") in the `cause` chain.
 * @param {any} error - The error to describe.
 * @returns {string} A message like "fetch failed (ECONNREFUSED)".
 * @example
 * describeError(error); // 'connect ECONNREFUSED 172.30.0.1:80'
 */
const describeError = (error) => {
  if (!error) {
    return 'unknown error';
  }
  const message = error.message || String(error);
  const code = error.code || (error.cause && (error.cause.code || error.cause.message));
  if (code && !message.includes(code)) {
    return `${message} (${code})`;
  }
  return message;
};

module.exports = { GladysApiError, describeError };
