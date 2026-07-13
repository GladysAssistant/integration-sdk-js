const { GladysIntegration } = require('../../lib');

/**
 * Build a client bound to a FakeGladysServer, with fast reconnection delays so
 * tests stay quick.
 */
const createClient = (server, options = {}) =>
  new GladysIntegration({
    hostApiUrl: server.url,
    token: server.token,
    selector: 'ext-demo',
    reconnectBaseDelay: 10,
    reconnectMaxDelay: 100,
    ...options,
  });

/**
 * Resolve on the next emission of an event.
 */
const once = (emitter, event) =>
  new Promise((resolve) => {
    emitter.once(event, resolve);
  });

module.exports = { createClient, once };
