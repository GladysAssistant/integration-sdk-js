const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('tts.synthesize command (contract B.20, gladys.onTtsSynthesize)', () => {
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

  it('should ack with the resolved data-URI in data.audio', async () => {
    const asked = [];
    const audio = `audio/mpeg;base64,${Buffer.from('mp3-bytes').toString('base64')}`;
    gladys.onTtsSynthesize(async (text, language) => {
      asked.push([text, language]);
      return audio;
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts', text: 'Bonjour', language: 'fr' });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-tts', success: true, data: { audio } });
    assert.deepEqual(asked, [['Bonjour', 'fr']]);
  });

  it('should pass language as null when Gladys sends none (scene announcement)', async () => {
    const asked = [];
    gladys.onTtsSynthesize(async (text, language) => {
      asked.push([text, language]);
      return `audio/wav;base64,${Buffer.from('wav-bytes').toString('base64')}`;
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-2', text: 'Hello' });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(result.payload.success, true);
    assert.deepEqual(asked, [['Hello', null]]);
  });

  it('should ack with success:false and the error message when the synthesis fails', async () => {
    gladys.onTtsSynthesize(async () => {
      throw new Error('engine unreachable');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-3', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-tts-3', success: false, error: 'engine unreachable' });
  });

  it('should ack with success:false "not implemented" when no handler is registered', async () => {
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-4', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-tts-4', success: false, error: 'not implemented' });
  });

  it('should ack with success:false when the handler resolves a non-string', async () => {
    gladys.onTtsSynthesize(async () => Buffer.from('mp3-bytes'));
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-5', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(result.payload.success, false);
    assert.match(result.payload.error, /audio string/);
  });

  it('should ack with success:false when the content type is not a curated one', async () => {
    gladys.onTtsSynthesize(async () => `audio/flac;base64,${Buffer.from('flac-bytes').toString('base64')}`);
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-6', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(result.payload.success, false);
    assert.match(result.payload.error, /must be one of audio\/mpeg, audio\/wav, audio\/ogg, audio\/aac/);
  });

  it('should ack with success:false when the data-URI has no ";base64," separator', async () => {
    gladys.onTtsSynthesize(async () => Buffer.from('mp3-bytes').toString('base64'));
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-7', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(result.payload.success, false);
    assert.match(result.payload.error, /must be one of/);
  });

  it('should ack with success:false when the audio is empty', async () => {
    gladys.onTtsSynthesize(async () => 'audio/mpeg;base64,');
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-8', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(result.payload.success, false);
    assert.match(result.payload.error, /audio is empty/);
  });

  it('should ack with success:false when the decoded audio exceeds 5 MB', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    gladys.onTtsSynthesize(async () => `audio/mpeg;base64,${oversized}`);
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-9', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(result.payload.success, false);
    assert.match(result.payload.error, /maximum decoded audio size/);
  });

  it('should accept a decoded audio of exactly 5 MB', async () => {
    const audio = `audio/ogg;base64,${Buffer.alloc(5 * 1024 * 1024).toString('base64')}`;
    gladys.onTtsSynthesize(async () => audio);
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'msg-tts-10', text: 'Hello', language: null });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-tts-10', success: true, data: { audio } });
  });
});
