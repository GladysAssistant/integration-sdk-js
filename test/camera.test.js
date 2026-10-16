const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const {
  GladysApiError,
  WEBSOCKET_MESSAGE_TYPES,
  CAMERA_STREAM_PROTOCOL_PARAM,
  CAMERA_STREAM_PROTOCOLS,
} = require('../lib');
const { MAX_WEBRTC_SDP_LENGTH, MAX_WEBRTC_ID_LENGTH } = require('../lib/constants');
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

  describe('camera.webrtc-offer command (gladys.onCameraWebRtcOffer)', () => {
    const webRtcDevice = {
      ...device,
      params: [{ name: CAMERA_STREAM_PROTOCOL_PARAM, value: CAMERA_STREAM_PROTOCOLS.WEBRTC }],
    };
    const offer = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n';
    const answer = 'v=0\r\no=- 3 4 IN IP4 0.0.0.0\r\n';

    const relayOffer = async (messageId) => {
      server.send(EXTERNAL_INTEGRATION.CAMERA_WEBRTC_OFFER, {
        message_id: messageId,
        device: webRtcDevice,
        session_id: 'gladys-session',
        sdp: offer,
      });
      return server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    };

    it('should export the reserved param and its value', () => {
      assert.equal(CAMERA_STREAM_PROTOCOL_PARAM, 'GLADYS_CAMERA_STREAM_PROTOCOL');
      assert.deepEqual(CAMERA_STREAM_PROTOCOLS, { WEBRTC: 'webrtc' });
    });

    it('should hand the offer to the handler and ack with the answer and the vendor ids', async () => {
      const asked = [];
      gladys.onCameraWebRtcOffer(async (d, received) => {
        asked.push([d, received]);
        return { sdpAnswer: answer, sessionId: 'netatmo-session', streamId: 'tag-1' };
      });
      await gladys.connect();
      const result = await relayOffer('msg-offer');
      assert.deepEqual(result.payload, {
        message_id: 'msg-offer',
        success: true,
        data: { sdp_answer: answer, session_id: 'netatmo-session', stream_id: 'tag-1' },
      });
      assert.deepEqual(asked, [[webRtcDevice, { sessionId: 'gladys-session', sdp: offer }]]);
    });

    it('should leave the optional ids out when the handler gives none', async () => {
      gladys.onCameraWebRtcOffer(async () => ({ sdpAnswer: answer, sessionId: null }));
      await gladys.connect();
      const result = await relayOffer('msg-offer-2');
      assert.deepEqual(result.payload, { message_id: 'msg-offer-2', success: true, data: { sdp_answer: answer } });
    });

    it('should ack a failure when the answer breaks the core bounds', async () => {
      const invalidAnswers = [
        undefined,
        {},
        { sdpAnswer: '' },
        { sdpAnswer: 42 },
        { sdpAnswer: 'a'.repeat(MAX_WEBRTC_SDP_LENGTH + 1) },
        { sdpAnswer: answer, sessionId: 42 },
        { sdpAnswer: answer, streamId: 'a'.repeat(MAX_WEBRTC_ID_LENGTH + 1) },
      ];
      let next = 0;
      gladys.onCameraWebRtcOffer(async () => invalidAnswers[next]);
      await gladys.connect();
      for (const [index] of invalidAnswers.entries()) {
        next = index;
        const result = await relayOffer(`msg-invalid-${index}`);
        assert.equal(result.payload.success, false, `answer #${index}`);
        assert.match(result.payload.error, /^onCameraWebRtcOffer: /);
      }
    });

    it('should ack the vendor error when the offer is refused', async () => {
      gladys.onCameraWebRtcOffer(async () => {
        throw new Error('camera offline');
      });
      await gladys.connect();
      const result = await relayOffer('msg-offer-3');
      assert.deepEqual(result.payload, { message_id: 'msg-offer-3', success: false, error: 'camera offline' });
    });

    it('should ack "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      const result = await relayOffer('msg-offer-4');
      assert.deepEqual(result.payload, { message_id: 'msg-offer-4', success: false, error: 'not implemented' });
    });
  });

  describe('camera.webrtc-stop command (gladys.onCameraWebRtcStop)', () => {
    it('should hand the vendor ids to the handler and ack', async () => {
      const stopped = [];
      gladys.onCameraWebRtcStop(async (d, session) => {
        stopped.push([d, session]);
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.CAMERA_WEBRTC_STOP, {
        message_id: 'msg-stop',
        device,
        session_id: 'netatmo-session',
        stream_id: 'tag-1',
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'msg-stop', success: true });
      assert.deepEqual(stopped, [[device, { sessionId: 'netatmo-session', streamId: 'tag-1' }]]);
    });
  });
});
