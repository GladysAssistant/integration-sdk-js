const { API_PREFIX } = require('./constants');
const { GladysApiError } = require('./errors');

/**
 * Minimal JSON client for the Gladys host API (contract C.2–C.3).
 * Uses the global fetch available in Node.js >= 20 — no HTTP dependency.
 */
class HttpClient {
  /**
   * @description Build an HTTP client bound to one integration token.
   * @param {string} baseUrl - Host API base URL, without trailing slash.
   * @param {string} token - Integration JWT, sent as a Bearer token.
   * @example
   * const client = new HttpClient('http://172.30.0.1:80', 'jwt');
   */
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /**
   * @description Send a request to the host API and return the parsed JSON body.
   * @param {string} method - HTTP method.
   * @param {string} path - Path relative to /api/integration/v1.
   * @param {object} [body] - Optional JSON body.
   * @returns {Promise<any>} Parsed JSON response.
   * @example
   * await client.request('GET', '/status');
   */
  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${API_PREFIX}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let errorBody = {};
      try {
        errorBody = await response.json();
      } catch {
        // Non-JSON error body: fall back to the HTTP status text.
      }
      throw new GladysApiError(
        errorBody.status || response.status,
        errorBody.code || 'UNKNOWN_ERROR',
        errorBody.message || response.statusText,
      );
    }
    return response.json();
  }

  /**
   * @description Send a GET request.
   * @param {string} path - Path relative to /api/integration/v1.
   * @returns {Promise<any>} Parsed JSON response.
   * @example
   * await client.get('/device');
   */
  async get(path) {
    return this.request('GET', path);
  }

  /**
   * @description Send a POST request with a JSON body.
   * @param {string} path - Path relative to /api/integration/v1.
   * @param {object} body - JSON body.
   * @returns {Promise<any>} Parsed JSON response.
   * @example
   * await client.post('/state', { states: [] });
   */
  async post(path, body) {
    return this.request('POST', path, body);
  }
}

module.exports = { HttpClient };
