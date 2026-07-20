const http = require('http');
const { WebSocketServer } = require('ws');

const API_PREFIX = '/api/integration/v1';

/**
 * Fake Gladys server for the SDK tests: the host API REST endpoints (contract
 * C.3) and the integration WebSocket (contract C.4), on the same HTTP server
 * like the real Gladys.
 */
class FakeGladysServer {
  constructor({ token = 'valid-integration-token' } = {}) {
    this.token = token;
    // Every HTTP request received, as { method, path, body, authorization }.
    this.requests = [];
    // Data returned by the REST endpoints.
    this.devices = [];
    this.config = {};
    this.containers = [];
    this.networkScanResults = [];
    this.contacts = [];
    this.linkedUser = { selector: 'john', first_name: 'John', language: 'en' };
    this.status = {
      gladys_version: '4.62.0',
      service: { id: 'service-id', selector: 'ext-demo', status: 'RUNNING', version: '1.0.0' },
    };
    // Map of "METHOD path" -> { status, body } forced responses.
    this.forcedResponses = new Map();
    // Set of "METHOD path" routes that never answer (timeout testing).
    this.hangingRoutes = new Set();
    // Connected & authenticated integration sockets.
    this.sockets = [];
    // Messages received on the WebSocket, as { type, payload }.
    this.wsMessages = [];
    this.wsMessageWaiters = [];
    this.server = null;
    this.wss = null;
    this.url = null;
  }

  async start(port = 0) {
    this.server = http.createServer((req, res) => this._handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (socket) => this._handleWsConnection(socket));
    await new Promise((resolve) => {
      this.server.listen(port, '127.0.0.1', resolve);
    });
    this.port = this.server.address().port;
    this.url = `http://127.0.0.1:${this.port}`;
  }

  async stop() {
    this.sockets.forEach((socket) => socket.terminate());
    await new Promise((resolve) => {
      this.wss.close(() => this.server.close(resolve));
    });
  }

  /**
   * Force the response of one endpoint, e.g. forceResponse('POST', '/state', 429, {...}).
   */
  forceResponse(method, path, status, body) {
    this.forcedResponses.set(`${method} ${path}`, { status, body });
  }

  /**
   * Return the recorded HTTP requests matching a method + path.
   */
  getRequests(method, path) {
    return this.requests.filter((r) => r.method === method && r.path === path);
  }

  /**
   * Send a message to the last authenticated integration socket.
   */
  send(type, payload = {}) {
    const socket = this.sockets[this.sockets.length - 1];
    socket.send(JSON.stringify({ type, payload }));
  }

  /**
   * Send raw (non-JSON or malformed) data to the integration socket.
   */
  sendRaw(data) {
    const socket = this.sockets[this.sockets.length - 1];
    socket.send(data);
  }

  /**
   * Resolve with the next WebSocket message of the given type (already
   * received ones included).
   */
  async waitForWsMessage(type) {
    const found = this.wsMessages.find((m) => m.type === type);
    if (found) {
      this.wsMessages = this.wsMessages.filter((m) => m !== found);
      return found;
    }
    return new Promise((resolve) => {
      this.wsMessageWaiters.push({ type, resolve });
    });
  }

  /**
   * Abruptly kill every integration socket (simulates a network drop).
   */
  killConnections() {
    this.sockets.forEach((socket) => socket.terminate());
    this.sockets = [];
  }

  _handleHttp(req, res) {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      const path = req.url.replace(API_PREFIX, '');
      const body = rawBody ? JSON.parse(rawBody) : undefined;
      this.requests.push({ method: req.method, path, body, authorization: req.headers.authorization });
      const respond = (status, responseBody, contentType = 'application/json') => {
        res.writeHead(status, { 'content-type': contentType });
        res.end(typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody));
      };
      if (this.hangingRoutes.has(`${req.method} ${path}`)) {
        // Never answer: the client is expected to abort on its own timeout.
        return;
      }
      const forced = this.forcedResponses.get(`${req.method} ${path}`);
      if (forced) {
        respond(forced.status, forced.body);
        return;
      }
      if (req.headers.authorization !== `Bearer ${this.token}`) {
        respond(401, { status: 401, code: 'UNAUTHORIZED', message: 'Invalid integration token' });
        return;
      }
      const route = `${req.method} ${path}`;
      if (req.method === 'POST' && /^\/container\/[^/]+\/(start|stop|restart)$/.test(path)) {
        respond(200, { success: true });
        return;
      }
      switch (route) {
        case 'GET /status':
          respond(200, this.status);
          break;
        case 'POST /heartbeat':
          respond(200, { success: true });
          break;
        case 'GET /device':
          respond(200, this.devices);
          break;
        case 'GET /config':
          respond(200, { config: this.config });
          break;
        case 'POST /config':
          Object.assign(this.config, body.config);
          respond(200, { success: true });
          break;
        case 'POST /discovered_device':
          respond(200, { success: true, count: body.devices.length });
          break;
        case 'POST /state':
          respond(200, { success: true });
          break;
        case 'POST /camera/image':
          respond(200, { success: true });
          break;
        case 'POST /device/transport':
          respond(200, { success: true });
          break;
        case 'POST /connection_status':
          respond(200, { success: true });
          break;
        case 'GET /container':
          respond(200, { containers: this.containers });
          break;
        case 'POST /network_discovery/scan':
          respond(200, this.networkScanResults);
          break;
        case 'POST /message':
          respond(200, { success: true });
          break;
        case 'POST /contact/link':
          respond(200, { user: this.linkedUser });
          break;
        case 'GET /contact':
          respond(200, this.contacts);
          break;
        default:
          respond(404, { status: 404, code: 'NOT_FOUND', message: `Route ${route} not found` });
      }
    });
  }

  _handleWsConnection(socket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'authenticate.integration-request') {
        if (message.payload.token === this.token) {
          this.sockets.push(socket);
          socket.send(JSON.stringify({ type: 'authentication.connected', payload: {} }));
        } else {
          socket.close(4000, 'INVALID_ACCESS_TOKEN');
        }
        return;
      }
      this.wsMessages.push(message);
      const waiterIndex = this.wsMessageWaiters.findIndex((w) => w.type === message.type);
      if (waiterIndex !== -1) {
        const [waiter] = this.wsMessageWaiters.splice(waiterIndex, 1);
        this.wsMessages = this.wsMessages.filter((m) => m !== message);
        waiter.resolve(message);
      }
    });
    socket.on('close', () => {
      this.sockets = this.sockets.filter((s) => s !== socket);
    });
  }
}

module.exports = { FakeGladysServer };
