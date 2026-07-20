const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('communication integrations (contract B.15)', () => {
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

  describe('gladys.onSendMessage(callback)', () => {
    it('should ack message.send with success:true after delivering the message', async () => {
      const delivered = [];
      gladys.onSendMessage(async (contactId, message) => {
        delivered.push([contactId, message]);
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.MESSAGE_SEND, {
        message_id: 'msg-1',
        contact_id: '12345',
        message: { text: 'The light is on', file: null },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'msg-1', success: true });
      assert.deepEqual(delivered, [['12345', { text: 'The light is on', file: null }]]);
    });

    it('should ack with success:false and the error message when the delivery fails', async () => {
      gladys.onSendMessage(async () => {
        throw new Error('channel unreachable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.MESSAGE_SEND, {
        message_id: 'msg-2',
        contact_id: '12345',
        message: { text: 'hello', file: null },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'msg-2', success: false, error: 'channel unreachable' });
    });

    it('should ack with success:false "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.MESSAGE_SEND, {
        message_id: 'msg-3',
        contact_id: '12345',
        message: { text: 'hello', file: null },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'msg-3', success: false, error: 'not implemented' });
    });
  });

  describe('gladys.publishMessage(contactId, text, options?)', () => {
    it('should POST /message with the contact id and the text', async () => {
      const response = await gladys.publishMessage('12345', 'Turn on the light');
      assert.deepEqual(response, { success: true });
      const requests = server.getRequests('POST', '/message');
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].body, { contact_id: '12345', text: 'Turn on the light' });
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });

    it('should send created_at as an ISO string, accepting a Date', async () => {
      const createdAt = new Date('2026-07-19T08:30:00.000Z');
      await gladys.publishMessage('12345', 'Received offline', { createdAt });
      await gladys.publishMessage('12345', 'Already a string', { createdAt: '2026-07-19T09:00:00.000Z' });
      const requests = server.getRequests('POST', '/message');
      assert.equal(requests[0].body.created_at, '2026-07-19T08:30:00.000Z');
      assert.equal(requests[1].body.created_at, '2026-07-19T09:00:00.000Z');
    });

    it('should validate the contact id and the text before any request', async () => {
      await assert.rejects(gladys.publishMessage('', 'hello'), /"contactId" must be a non-empty string/);
      await assert.rejects(gladys.publishMessage('12345', ''), /"text" must be a non-empty string/);
      await assert.rejects(gladys.publishMessage('12345', 'a'.repeat(4097)), /maximum text length is 4096/);
      assert.equal(server.getRequests('POST', '/message').length, 0);
    });

    it('should throw a 404 GladysApiError when the contact is not linked', async () => {
      server.forceResponse('POST', '/message', 404, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'CONTACT_NOT_FOUND',
      });
      await assert.rejects(gladys.publishMessage('unknown', 'hello'), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 404);
        assert.equal(error.message, 'CONTACT_NOT_FOUND');
        return true;
      });
    });
  });

  describe('gladys.linkContact(code, contactId, contactName?)', () => {
    it('should POST /contact/link and resolve with the linked user', async () => {
      const user = await gladys.linkContact('AB23CD45', '12345', 'John');
      assert.deepEqual(user, { selector: 'john', first_name: 'John', language: 'en' });
      const requests = server.getRequests('POST', '/contact/link');
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].body, { code: 'AB23CD45', contact_id: '12345', contact_name: 'John' });
    });

    it('should omit contact_name when not provided', async () => {
      await gladys.linkContact('AB23CD45', '12345');
      const requests = server.getRequests('POST', '/contact/link');
      assert.deepEqual(requests[0].body, { code: 'AB23CD45', contact_id: '12345' });
    });

    it('should validate the code and the contact id before any request', async () => {
      await assert.rejects(gladys.linkContact('', '12345'), /"code" must be a non-empty string/);
      await assert.rejects(gladys.linkContact('AB23CD45', ''), /"contactId" must be a non-empty string/);
      assert.equal(server.getRequests('POST', '/contact/link').length, 0);
    });

    it('should throw a 404 GladysApiError when the code is invalid or expired', async () => {
      server.forceResponse('POST', '/contact/link', 404, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'INVALID_LINK_CODE',
      });
      await assert.rejects(gladys.linkContact('WRONG', '12345'), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 404);
        assert.equal(error.message, 'INVALID_LINK_CODE');
        return true;
      });
    });
  });

  describe('gladys.getContacts()', () => {
    it('should GET /contact and resolve with the linked contacts', async () => {
      server.contacts = [
        {
          contact_id: '12345',
          contact_name: 'John',
          linked_at: '2026-07-19T08:30:00.000Z',
          user: { selector: 'john', first_name: 'John', language: 'en' },
        },
      ];
      const contacts = await gladys.getContacts();
      assert.deepEqual(contacts, server.contacts);
    });
  });
});
