const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { AI_CHAT_PURPOSES, WEBSOCKET_MESSAGE_TYPES, validateAiCompletion } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');
const { withDebug } = require('./helpers/debug');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

const request = {
  messages: [
    { role: 'system', content: 'You are Gladys.' },
    { role: 'user', content: 'Turn on the kitchen light' },
  ],
  tools: [{ type: 'function', function: { name: 'device_set_value', parameters: { type: 'object' } } }],
  tool_choice: 'auto',
  max_tokens: 800,
  purpose: AI_CHAT_PURPOSES.CHAT,
  categories: ['device'],
};

const completion = {
  id: 'chatcmpl-1',
  model: 'claude',
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'device_set_value', arguments: '{"value":1}' } },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: { total_tokens: 42 },
};

describe('AI provider integrations (contract capabilities/ai-type.md)', () => {
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

  describe('gladys.onAiChat(callback) — ai.chat relay', () => {
    it('should pass the request through and ack the completion as data', async () => {
      const requests = [];
      gladys.onAiChat(async (received) => {
        requests.push(received);
        return completion;
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: 'ai-1', request });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-1', success: true, data: completion });
      assert.deepEqual(requests, [request]);
    });

    it('should ack a failure when the handler throws', async () => {
      gladys.onAiChat(async () => {
        throw new Error('provider API unreachable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: 'ai-2', request });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-2', success: false, error: 'provider API unreachable' });
    });

    it('should ack a failure "not implemented" without handler', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: 'ai-3', request });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ai-3', success: false, error: 'not implemented' });
    });

    it('should ack a failure, never an empty success, when the resolved value is not a completion', async () => {
      const answers = [undefined, 'Hello', { choices: [] }, { choices: [{ message: 'Hello' }] }];
      let index = 0;
      gladys.onAiChat(async () => answers[index]);
      await gladys.connect();
      for (index = 0; index < answers.length; index += 1) {
        server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: `ai-shape-${index}`, request });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, false);
        assert.match(result.payload.error, /OpenAI-compatible completion/);
      }
    });

    it('should log what the core would refuse or truncate when DEBUG=gladys-integration-sdk is set, and still ack', async () => {
      gladys.onAiChat(async () => ({
        choices: [{ message: { role: 'assistant', content: 42 } }],
      }));
      await gladys.connect();
      const lines = await withDebug(async () => {
        server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: 'ai-4', request });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, true);
      });
      const issues = lines.filter((line) => line.includes('ai completion:'));
      assert.equal(issues.length, 1);
      assert.match(issues[0], /content: must be a string or null/);
    });

    it('should not validate the completion when the debug channel is off', async () => {
      gladys.onAiChat(async () => ({ choices: [{ message: { content: 42 } }] }));
      await gladys.connect();
      const originalError = console.error;
      const lines = [];
      console.error = (...args) => lines.push(args.join(' '));
      try {
        server.send(EXTERNAL_INTEGRATION.AI_CHAT, { message_id: 'ai-5', request });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, true);
      } finally {
        console.error = originalError;
      }
      assert.deepEqual(lines, []);
    });
  });

  describe('validateAiCompletion(completion)', () => {
    it('should accept a completion the core keeps unchanged', () => {
      assert.deepEqual(validateAiCompletion(completion), []);
      assert.deepEqual(validateAiCompletion({ choices: [{ message: { role: 'assistant', content: 'Hi' } }] }), []);
      assert.deepEqual(validateAiCompletion({ choices: [{ message: { content: null, tool_calls: null } }] }), []);
    });

    it('should refuse anything without an object choices[0].message', () => {
      for (const value of [undefined, null, 'Hi', [], {}, { choices: 'x' }, { choices: [] }, { choices: [{}] }]) {
        assert.deepEqual(validateAiCompletion(value), [
          'completion: must be an object whose choices[0].message is an object — refused by Gladys',
        ]);
      }
    });

    it('should report the extra choices and the truncations', () => {
      const issues = validateAiCompletion({
        choices: [
          {
            message: {
              content: 'x'.repeat(50001),
              tool_calls: [{ id: 'i'.repeat(129), type: 'function', function: { name: 'ok', arguments: '{}' } }],
            },
          },
          { message: { content: 'second' } },
        ],
      });
      assert.deepEqual(issues, [
        'choices: 2 choices, only the first one is read by Gladys',
        'choices[0].message.content: 50001 characters, truncated at 50000',
        'choices[0].message.tool_calls[0].id: 129 characters, truncated at 128',
      ]);
    });

    it('should report what fails the whole completion', () => {
      assert.deepEqual(validateAiCompletion({ choices: [{ message: { content: ['part'] } }] }), [
        'choices[0].message.content: must be a string or null — completion refused by Gladys',
      ]);
      assert.deepEqual(validateAiCompletion({ choices: [{ message: { content: null, tool_calls: {} } }] }), [
        'choices[0].message.tool_calls: must be an array — completion refused by Gladys',
      ]);
      const tooMany = Array.from({ length: 21 }, () => ({ type: 'function', function: { name: 'ok' } }));
      assert.deepEqual(validateAiCompletion({ choices: [{ message: { content: null, tool_calls: tooMany } }] }), [
        'choices[0].message.tool_calls: 21 tool calls, 20 allowed — completion refused by Gladys',
      ]);
      const malformed = [
        'not an object',
        { type: 'function' },
        { type: 'function', function: { name: 'bad name!' } },
        { type: 'function', function: { name: 'ok', arguments: { value: 1 } } },
        { type: 'function', function: { name: 'ok', arguments: 'x'.repeat(100001) } },
      ];
      assert.deepEqual(validateAiCompletion({ choices: [{ message: { tool_calls: malformed } }] }), [
        'choices[0].message.tool_calls[0]: must be an object with a "function" object — completion refused by Gladys',
        'choices[0].message.tool_calls[1]: must be an object with a "function" object — completion refused by Gladys',
        'choices[0].message.tool_calls[2].function.name: must match /^[a-zA-Z0-9_-]{1,64}$/ — completion refused by Gladys',
        'choices[0].message.tool_calls[3].function.arguments: must be a JSON string of at most 100000 characters — completion refused by Gladys',
        'choices[0].message.tool_calls[4].function.arguments: must be a JSON string of at most 100000 characters — completion refused by Gladys',
      ]);
    });
  });
});
