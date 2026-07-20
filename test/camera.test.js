const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('camera images (contract C.3/C.4)', () => {
  let server;
  let gladys;

  const device = { external_id: 'ext:ext-demo:cam:abc', selector: 'cam-abc', params: [] };

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  describe('gladys.publishCameraImage(deviceExternalId, image)', () => {
    it('should POST /camera/image with the device external_id and the image', async () => {
      const image = 'image/jpg;base64,/9j/4AAQ';
      const response = await gladys.publishCameraImage(device.external_id, image);
      assert.deepEqual(response, { success: true });
      const requests = server.getRequests('POST', '/camera/image');
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].body, { device_external_id: device.external_id, image });
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });

    it('should throw when the image is not a string', async () => {
      await assert.rejects(gladys.publishCameraImage(device.external_id, Buffer.from('jpeg')), /must be an "image/);
      assert.equal(server.getRequests('POST', '/camera/image').length, 0);
    });

    it('should throw when the image exceeds 150 KB, without sending it', async () => {
      const image = `image/jpg;base64,${'A'.repeat(150 * 1024)}`;
      await assert.rejects(gladys.publishCameraImage(device.external_id, image), /maximum image size/);
      assert.equal(server.getRequests('POST', '/camera/image').length, 0);
    });

    it('should accept an image of exactly 150 KB', async () => {
      const image = 'A'.repeat(150 * 1024);
      const response = await gladys.publishCameraImage(device.external_id, image);
      assert.deepEqual(response, { success: true });
    });

    it('should surface the per-device rate limit as a GladysApiError', async () => {
      server.forceResponse('POST', '/camera/image', 429, {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit of 12 images/minute per device exceeded',
      });
      await assert.rejects(gladys.publishCameraImage(device.external_id, 'image/jpg;base64,x'), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 429);
        assert.equal(error.code, 'TOO_MANY_REQUESTS');
        return true;
      });
    });
  });

  describe('camera.get-image command (gladys.onGetImage)', () => {
    it('should ack with the resolved image in data.image', async () => {
      const asked = [];
      gladys.onGetImage(async (d) => {
        asked.push(d);
        return 'image/jpg;base64,/9j/fresh';
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.CAMERA_GET_IMAGE, { message_id: 'msg-img', device });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'msg-img',
        success: true,
        data: { image: 'image/jpg;base64,/9j/fresh' },
      });
      assert.deepEqual(asked, [device]);
    });

    it('should ack with success:false and the error message when the capture fails', async () => {
      gladys.onGetImage(async () => {
        throw new Error('camera unreachable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.CAMERA_GET_IMAGE, { message_id: 'msg-img-2', device });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'msg-img-2', success: false, error: 'camera unreachable' });
    });

    it('should ack with success:false "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.CAMERA_GET_IMAGE, { message_id: 'msg-img-3', device });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'msg-img-3', success: false, error: 'not implemented' });
    });
  });
});
