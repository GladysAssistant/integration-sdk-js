/**
 * @description Compute the reconnection delay: min(baseDelay * 2^attempt, maxDelay).
 * @param {number} attempt - Zero-based count of consecutive failed attempts.
 * @param {number} baseDelay - First delay, in milliseconds.
 * @param {number} maxDelay - Delay cap, in milliseconds.
 * @returns {number} The delay to wait before the next attempt, in milliseconds.
 * @example
 * computeBackoffDelay(3, 1000, 60000); // 8000
 */
const computeBackoffDelay = (attempt, baseDelay, maxDelay) => Math.min(baseDelay * 2 ** attempt, maxDelay);

module.exports = { computeBackoffDelay };
