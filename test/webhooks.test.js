const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, deferred } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('Gladys Plus webhooks (contract B.17)', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  describe('gladys.getWebhooks()', () => {
    it('should GET /webhook and resolve with the availability and the ready-to-register URLs', async () => {
      server.webhooks = {
        available: true,
        webhooks: [
          {
            key: 'events',
            mode: 'fire_and_forget',
            url: 'https://api.gladysgateway.com/v1/api/external-integration/key/ext-demo/events',
          },
        ],
      };
      const info = await gladys.getWebhooks();
      assert.deepEqual(info, server.webhooks);
      const requests = server.getRequests('GET', '/webhook');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });

    it('should resolve with available:false when Gladys Plus is not linked', async () => {
      const info = await gladys.getWebhooks();
      assert.deepEqual(info, { available: false, webhooks: [] });
    });
  });

  describe('gladys.onWebhook(key, callback) — fire_and_forget relay (webhook.received)', () => {
    it('should call the handler of the webhook key with the relayed request, without any ack', async () => {
      const { promise: called, resolve } = deferred();
      gladys.onWebhook('events', resolve);
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_RECEIVED, {
        webhook_key: 'events',
        method: 'POST',
        query: { source: 'netatmo' },
        body: '{"event_type":"therm_mode"}',
        content_type: 'application/json',
      });
      const request = await called;
      assert.deepEqual(request, {
        method: 'POST',
        query: { source: 'netatmo' },
        body: '{"event_type":"therm_mode"}',
        contentType: 'application/json',
      });
      // No message_id, no ack (contract B.17): nothing must be sent back.
      await delay(50);
      assert.deepEqual(server.wsMessages, []);
    });

    it('should ignore the resolved value and swallow handler errors', async () => {
      const { promise: called, resolve } = deferred();
      gladys.onWebhook('events', () => {
        resolve();
        throw new Error('handler failed');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_RECEIVED, {
        webhook_key: 'events',
        method: 'POST',
        query: {},
        body: '',
        content_type: 'application/json',
      });
      await called;
      await delay(50);
      assert.deepEqual(server.wsMessages, []);
    });

    it('should ignore silently a webhook key without handler', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_RECEIVED, {
        webhook_key: 'unknown',
        method: 'POST',
        query: {},
        body: '',
        content_type: 'application/json',
      });
      await delay(50);
      assert.deepEqual(server.wsMessages, []);
    });
  });

  describe('gladys.onWebhook(key, callback) — sync relay (webhook.request)', () => {
    it('should ack with the mapped { status, content_type, body } response', async () => {
      gladys.onWebhook('callback', async ({ query }) => ({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 'hub.challenge': query['hub.challenge'] }),
      }));
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_REQUEST, {
        message_id: 'wh-1',
        webhook_key: 'callback',
        method: 'GET',
        query: { 'hub.challenge': 'abc123' },
        body: null,
        content_type: null,
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'wh-1',
        success: true,
        data: { status: 200, content_type: 'application/json', body: '{"hub.challenge":"abc123"}' },
      });
    });

    it('should ack success without data when the handler resolves undefined (default empty 200)', async () => {
      const seen = [];
      gladys.onWebhook('callback', async (request) => {
        seen.push(request);
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_REQUEST, {
        message_id: 'wh-2',
        webhook_key: 'callback',
        method: 'POST',
        query: {},
        body: 'raw-body',
        content_type: 'text/plain',
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wh-2', success: true });
      assert.deepEqual(seen, [{ method: 'POST', query: {}, body: 'raw-body', contentType: 'text/plain' }]);
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onWebhook('callback', async () => {
        throw new Error('subscription rejected');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_REQUEST, {
        message_id: 'wh-3',
        webhook_key: 'callback',
        method: 'POST',
        query: {},
        body: '',
        content_type: null,
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wh-3', success: false, error: 'subscription rejected' });
    });

    it('should ack with success:false "not implemented" when no handler is registered for the key', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_REQUEST, {
        message_id: 'wh-4',
        webhook_key: 'unknown',
        method: 'POST',
        query: {},
        body: '',
        content_type: null,
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wh-4', success: false, error: 'not implemented' });
    });

    it('should validate the resolved response shape', async () => {
      const responses = [
        ['a string', /must be an object/],
        [{ status: 512 }, /"status" must be an integer between 200 and 499/],
        [{ status: 200.5 }, /"status" must be an integer between 200 and 499/],
        [{ contentType: 42 }, /"contentType" must be a string/],
        [{ body: { not: 'a string' } }, /"body" must be a string/],
        [{ body: 'a'.repeat(64 * 1024 + 1) }, /maximum sync response body size is 65536 bytes/],
      ];
      let response;
      gladys.onWebhook('callback', async () => response);
      await gladys.connect();
      for (let i = 0; i < responses.length; i += 1) {
        const [value, expectedError] = responses[i];
        response = value;
        server.send(EXTERNAL_INTEGRATION.WEBHOOK_REQUEST, {
          message_id: `wh-bad-${i}`,
          webhook_key: 'callback',
          method: 'POST',
          query: {},
          body: '',
          content_type: null,
        });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.message_id, `wh-bad-${i}`);
        assert.equal(result.payload.success, false);
        assert.match(result.payload.error, expectedError);
      }
    });

    it('should accept a partial response (status only)', async () => {
      gladys.onWebhook('callback', async () => ({ status: 204 }));
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_REQUEST, {
        message_id: 'wh-5',
        webhook_key: 'callback',
        method: 'POST',
        query: {},
        body: '',
        content_type: null,
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wh-5', success: true, data: { status: 204 } });
    });
  });

  describe('gladys.onWebhookUpdated(callback)', () => {
    it('should call the handler with the new availability and URLs', async () => {
      const { promise: called, resolve } = deferred();
      gladys.onWebhookUpdated(resolve);
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_UPDATED, {
        available: true,
        webhooks: [{ key: 'events', mode: 'fire_and_forget', url: 'https://api.gladysgateway.com/…/events' }],
      });
      const info = await called;
      assert.deepEqual(info, {
        available: true,
        webhooks: [{ key: 'events', mode: 'fire_and_forget', url: 'https://api.gladysgateway.com/…/events' }],
      });
    });

    it('should do nothing when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEBHOOK_UPDATED, { available: false, webhooks: [] });
      await delay(50);
      assert.equal(gladys.connected, true);
    });
  });
});
