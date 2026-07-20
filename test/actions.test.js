const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('manifest actions (action.run relay)', () => {
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

  it('should ack action.run with the resolved string in data.message', async () => {
    const received = [];
    gladys.onAction('detect_protocol', async (fields) => {
      received.push(fields);
      return `Protocol 3.3 detected on ${fields.ip}`;
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.ACTION_RUN, {
      message_id: 'msg-1',
      key: 'detect_protocol',
      fields: { ip: '192.168.1.42' },
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, {
      message_id: 'msg-1',
      success: true,
      data: { message: 'Protocol 3.3 detected on 192.168.1.42' },
    });
    assert.deepEqual(received, [{ ip: '192.168.1.42' }]);
  });

  it('should ack action.run with a multi-language message object in data.message', async () => {
    gladys.onAction('test_connection', async () => ({ en: 'Connected!', fr: 'Connecté !' }));
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.ACTION_RUN, { message_id: 'msg-2', key: 'test_connection', fields: {} });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, {
      message_id: 'msg-2',
      success: true,
      data: { message: { en: 'Connected!', fr: 'Connecté !' } },
    });
  });

  it('should dispatch each action.run to the handler registered for its key', async () => {
    const calls = [];
    gladys.onAction('identify', async () => {
      calls.push('identify');
      return 'Blinking';
    });
    gladys.onAction('re_pair', async () => {
      calls.push('re_pair');
      return 'Paired';
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.ACTION_RUN, { message_id: 'msg-3', key: 're_pair', fields: {} });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-3', success: true, data: { message: 'Paired' } });
    assert.deepEqual(calls, ['re_pair']);
  });

  it('should ack action.run with success:false and the error message when the handler throws', async () => {
    gladys.onAction('detect_protocol', async () => {
      throw new Error('device unreachable at this IP');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.ACTION_RUN, {
      message_id: 'msg-4',
      key: 'detect_protocol',
      fields: { ip: '192.168.1.99' },
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-4', success: false, error: 'device unreachable at this IP' });
  });

  it('should ack action.run with "not implemented" when no handler is registered for the key', async () => {
    gladys.onAction('identify', async () => 'Blinking');
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.ACTION_RUN, { message_id: 'msg-5', key: 'unknown_action', fields: {} });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-5', success: false, error: 'not implemented' });
  });
});
