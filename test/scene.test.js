const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('scene triggers and actions declared by the manifest', () => {
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

  describe('gladys.publishSceneEvent(key, data?)', () => {
    it('should POST /scene/event with the key and the flat data', async () => {
      const result = await gladys.publishSceneEvent('object_detected', {
        camera: gladys.externalId('cam:front'),
        label: 'person',
        zone: null,
        score: 0.92,
        verified: true,
      });
      assert.deepEqual(result, { success: true });
      const requests = server.getRequests('POST', '/scene/event');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
      assert.deepEqual(requests[0].body, {
        key: 'object_detected',
        data: { camera: 'ext:ext-demo:cam:front', label: 'person', zone: null, score: 0.92, verified: true },
      });
    });

    it('should send an empty data object when none is given', async () => {
      await gladys.publishSceneEvent('doorbell_pressed');
      assert.deepEqual(server.getRequests('POST', '/scene/event')[0].body, { key: 'doorbell_pressed', data: {} });
    });

    it('should reject an invalid key before any request', async () => {
      await assert.rejects(gladys.publishSceneEvent('', {}), /"key" must be a non-empty string/);
      await assert.rejects(gladys.publishSceneEvent(42, {}), /"key" must be a non-empty string/);
      assert.equal(server.getRequests('POST', '/scene/event').length, 0);
    });

    it('should reject data that is not a flat object', async () => {
      await assert.rejects(gladys.publishSceneEvent('k', null), /"data" must be a flat object/);
      await assert.rejects(gladys.publishSceneEvent('k', ['a']), /"data" must be a flat object/);
      await assert.rejects(gladys.publishSceneEvent('k', 'text'), /"data" must be a flat object/);
      assert.equal(server.getRequests('POST', '/scene/event').length, 0);
    });

    it('should reject nested objects, arrays and non-finite numbers (one primitive per key)', async () => {
      await assert.rejects(
        gladys.publishSceneEvent('k', { nested: { a: 1 } }),
        /"data\.nested" must be a string, a finite number, a boolean or null/,
      );
      await assert.rejects(gladys.publishSceneEvent('k', { list: ['a'] }), /"data\.list" must be a string/);
      await assert.rejects(gladys.publishSceneEvent('k', { score: Infinity }), /"data\.score" must be a string/);
      await assert.rejects(gladys.publishSceneEvent('k', { score: NaN }), /"data\.score" must be a string/);
      await assert.rejects(gladys.publishSceneEvent('k', { when: undefined }), /"data\.when" must be a string/);
      assert.equal(server.getRequests('POST', '/scene/event').length, 0);
    });

    it('should reject a string over 1000 characters and more than 30 keys', async () => {
      await assert.rejects(
        gladys.publishSceneEvent('k', { text: 'x'.repeat(1001) }),
        /"data\.text" must be a string of at most 1000 characters/,
      );
      await gladys.publishSceneEvent('k', { text: 'x'.repeat(1000) });
      const tooMany = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, i]));
      await assert.rejects(gladys.publishSceneEvent('k', tooMany), /maximum 30 keys per event/);
      const justEnough = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
      await gladys.publishSceneEvent('k', justEnough);
      assert.equal(server.getRequests('POST', '/scene/event').length, 2);
    });

    it('should throw a GladysApiError on a key the manifest does not declare (404)', async () => {
      server.forceResponse('POST', '/scene/event', 404, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'SCENE_TRIGGER_NOT_DECLARED: scene trigger unknown is not declared in the manifest',
      });
      await assert.rejects(gladys.publishSceneEvent('unknown', {}), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, 'NOT_FOUND');
        return true;
      });
    });

    it('should throw a GladysApiError past the rate limit (429)', async () => {
      server.forceResponse('POST', '/scene/event', 429, {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'RATE_LIMIT_EXCEEDED: max 300 scene events per minute',
      });
      await assert.rejects(gladys.publishSceneEvent('object_detected', {}), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 429);
        return true;
      });
    });
  });

  describe('gladys.onSceneAction(key, callback) — scene-action.run relay', () => {
    it('should ack scene-action.run with the resolved outputs in data.outputs', async () => {
      const received = [];
      gladys.onSceneAction('create_snapshot', async (fields) => {
        received.push(fields);
        return { clip_id: '1726646400.123-abc', count: 1 };
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, {
        message_id: 'sa-1',
        key: 'create_snapshot',
        fields: { camera: 'ext:ext-demo:cam:front', caption: 'Visitor: person in driveway' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'sa-1',
        success: true,
        data: { outputs: { clip_id: '1726646400.123-abc', count: 1 } },
      });
      assert.deepEqual(received, [{ camera: 'ext:ext-demo:cam:front', caption: 'Visitor: person in driveway' }]);
    });

    it('should ack without data when the handler resolves undefined (no outputs)', async () => {
      gladys.onSceneAction('clean', async () => {});
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { message_id: 'sa-2', key: 'clean', fields: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'sa-2', success: true });
    });

    it('should dispatch each scene-action.run to the handler registered for its key', async () => {
      const calls = [];
      gladys.onSceneAction('clean', async () => {
        calls.push('clean');
      });
      gladys.onSceneAction('dock', async () => {
        calls.push('dock');
        return { ok: true };
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { message_id: 'sa-3', key: 'dock', fields: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'sa-3', success: true, data: { outputs: { ok: true } } });
      assert.deepEqual(calls, ['dock']);
    });

    it('should keep the manifest actions and the scene actions in two namespaces', async () => {
      const calls = [];
      gladys.onAction('identify', async () => {
        calls.push('action');
        return 'Blinking';
      });
      gladys.onSceneAction('identify', async () => {
        calls.push('scene');
        return { done: true };
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { message_id: 'sa-4', key: 'identify', fields: {} });
      let result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'sa-4', success: true, data: { outputs: { done: true } } });
      server.send(EXTERNAL_INTEGRATION.ACTION_RUN, { message_id: 'a-4', key: 'identify', fields: {} });
      result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'a-4', success: true, data: { message: 'Blinking' } });
      assert.deepEqual(calls, ['scene', 'action']);
    });

    it('should ack with success:false when the resolved outputs are not an object', async () => {
      gladys.onSceneAction('create_snapshot', async () => 'clip-1');
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { message_id: 'sa-5', key: 'create_snapshot', fields: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.equal(result.payload.success, false);
      assert.match(result.payload.error, /resolved outputs must be an object/);
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onSceneAction('create_snapshot', async () => {
        throw new Error('camera offline');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { message_id: 'sa-6', key: 'create_snapshot', fields: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'sa-6', success: false, error: 'camera offline' });
    });

    it('should ack with "not implemented" when no handler is registered for the key', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, { message_id: 'sa-7', key: 'unknown', fields: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'sa-7', success: false, error: 'not implemented' });
    });
  });

  describe('protocol constants', () => {
    it('should expose the scene-action.run message type of contract C.4', () => {
      assert.equal(EXTERNAL_INTEGRATION.SCENE_ACTION_RUN, 'external-integration.scene-action.run');
    });
  });
});
