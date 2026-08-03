const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('AI provider integrations (contract B.19)', () => {
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

  describe('gladys.onAiChat(callback)', () => {
    it('should ack ai.chat with the completion resolved by the handler as data', async () => {
      const received = [];
      const completion = {
        choices: [{ message: { content: 'The kitchen light is on.', tool_calls: null } }],
        usage: { prompt_tokens: 42, completion_tokens: 12 },
      };
      gladys.onAiChat(async (request) => {
        received.push(request);
        return completion;
      });
      await gladys.connect();
      const request = {
        messages: [
          { role: 'system', content: 'You are Gladys.' },
          { role: 'user', content: 'Is the kitchen light on?' },
        ],
        tools: [{ type: 'function', function: { name: 'get_device_state' } }],
        tool_choice: 'auto',
        purpose: 'chat',
        categories: ['light'],
      };
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: 'ai-1', request });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-1', success: true, data: completion });
      assert.deepEqual(received, [request]);
    });

    it('should accept a completion whose message only carries tool_calls', async () => {
      const completion = {
        choices: [{ message: { tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'turn_on' } }] } }],
      };
      gladys.onAiChat(async () => completion);
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, {
        message_id: 'ai-2',
        request: { messages: [{ role: 'user', content: 'Turn on the light' }], tool_choice: 'required' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-2', success: true, data: completion });
    });

    it('should ack with success:false and the error message when the provider fails', async () => {
      gladys.onAiChat(async () => {
        throw new Error('provider error 503');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, {
        message_id: 'ai-3',
        request: { messages: [{ role: 'user', content: 'hello' }] },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-3', success: false, error: 'provider error 503' });
    });

    it('should ack with success:false when the handler resolves a malformed completion', async () => {
      const malformed = [
        undefined,
        null,
        'a plain string',
        {},
        { choices: 'not-an-array' },
        { choices: [] },
        { choices: [{ message: 'not-an-object' }] },
        { choices: [{ message: ['not', 'an', 'object'] }] },
      ];
      let next = 0;
      gladys.onAiChat(async () => malformed[next]);
      await gladys.connect();
      for (next = 0; next < malformed.length; next += 1) {
        server.send(EXTERNAL_INTEGRATION.AI_CHAT, {
          message_id: `ai-bad-${next}`,
          request: { messages: [{ role: 'user', content: 'hello' }] },
        });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.message_id, `ai-bad-${next}`);
        assert.equal(result.payload.success, false);
        assert.match(result.payload.error, /OpenAI-compatible completion carrying an object choices\[0\]\.message/);
      }
    });

    it('should ack with success:false "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, {
        message_id: 'ai-4',
        request: { messages: [{ role: 'user', content: 'hello' }] },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-4', success: false, error: 'not implemented' });
    });
  });
});
