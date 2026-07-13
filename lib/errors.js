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

module.exports = { GladysApiError };
