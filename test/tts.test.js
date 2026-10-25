const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { TTS_AUDIO_CONTENT_TYPES, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

const MP3 = `audio/mpeg;base64,${Buffer.from('ID3 fake mp3 bytes').toString('base64')}`;

describe('TTS provider integrations (contract capabilities/tts-type.md)', () => {
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

  /** Relay one synthesis and resolve with the ack payload. */
  const synthesize = async (payload) => {
    server.send(EXTERNAL_INTEGRATION.TTS_SYNTHESIZE, { message_id: 'tts', ...payload });
    return (await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT)).payload;
  };

  describe('gladys.onTtsSynthesize(callback) — tts.synthesize relay', () => {
    it('should pass the text and the language through and ack the audio as data.audio', async () => {
      const calls = [];
      gladys.onTtsSynthesize(async (text, language) => {
        calls.push([text, language]);
        return MP3;
      });
      await gladys.connect();
      assert.deepEqual(await synthesize({ text: 'Bonjour', language: 'fr' }), {
        message_id: 'tts',
        success: true,
        data: { audio: MP3 },
      });
      assert.deepEqual(calls, [['Bonjour', 'fr']]);
    });

    it('should default the language to null when the core sends none', async () => {
      const calls = [];
      gladys.onTtsSynthesize(async (text, language) => {
        calls.push([text, language]);
        return MP3;
      });
      await gladys.connect();
      await synthesize({ text: 'Hello' });
      await synthesize({ text: 'Hello', language: null });
      assert.deepEqual(calls, [
        ['Hello', null],
        ['Hello', null],
      ]);
    });

    it('should accept every content type of the contract, with or without the data: scheme', async () => {
      let audio;
      gladys.onTtsSynthesize(async () => audio);
      await gladys.connect();
      for (const contentType of Object.keys(TTS_AUDIO_CONTENT_TYPES)) {
        audio = `${contentType};base64,AAAA`;
        assert.deepEqual((await synthesize({ text: 'Hi' })).data, { audio });
        audio = `data:${contentType};base64,AAAA`;
        assert.deepEqual((await synthesize({ text: 'Hi' })).data, { audio });
      }
    });

    it('should ack a failure when the handler throws, or without handler', async () => {
      await gladys.connect();
      assert.deepEqual(await synthesize({ text: 'Hi' }), {
        message_id: 'tts',
        success: false,
        error: 'not implemented',
      });
      gladys.onTtsSynthesize(async () => {
        throw new Error('engine crashed');
      });
      assert.deepEqual(await synthesize({ text: 'Hi' }), {
        message_id: 'tts',
        success: false,
        error: 'engine crashed',
      });
    });

    it('should ack a failure with the reason when the resolved audio would be refused by the core', async () => {
      let audio;
      gladys.onTtsSynthesize(async () => audio);
      await gladys.connect();
      const cases = [
        [undefined, /must be a "<content type>;base64,..." string/],
        ['', /must be a "<content type>;base64,..." string/],
        [Buffer.from('mp3'), /must be a "<content type>;base64,..." string/],
        ['AAAA', /content type must be one of audio\/mpeg, audio\/wav, audio\/ogg, audio\/aac/],
        ['audio/flac;base64,AAAA', /content type must be one of/],
        ['constructor;base64,AAAA', /content type must be one of/],
        ['audio/mpeg;base64,', /payload must be base64/],
        ['audio/mpeg;base64,A', /decodes to nothing/],
        ['audio/mpeg;base64,A=', /decodes to nothing/],
        ['audio/mpeg;base64,A==', /decodes to nothing/],
        ['audio/mpeg;base64,AAA\nAAA', /payload must be base64/],
        ['audio/mpeg;base64,AA$A', /payload must be base64/],
        [`audio/mpeg;base64,${'A'.repeat(Math.ceil((5 * 1024 * 1024 + 3) / 3) * 4)}`, /5 MB allowed/],
      ];
      for (const [value, expected] of cases) {
        audio = value;
        const result = await synthesize({ text: 'Hi' });
        assert.equal(result.success, false, `accepted ${String(value).slice(0, 40)}`);
        assert.match(result.error, expected);
      }
    });

    it('should read the decoded size from the padding, without decoding the clip', async () => {
      // 5 MB exactly, padded: accepted; one more byte: refused.
      const exact = Buffer.alloc(5 * 1024 * 1024 - 1).toString('base64'); // ends with "="
      const twoPadding = Buffer.alloc(5 * 1024 * 1024 - 2).toString('base64'); // ends with "=="
      const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
      let audio;
      gladys.onTtsSynthesize(async () => audio);
      await gladys.connect();
      audio = `audio/wav;base64,${exact}`;
      assert.equal((await synthesize({ text: 'Hi' })).success, true);
      audio = `audio/wav;base64,${twoPadding}`;
      assert.equal((await synthesize({ text: 'Hi' })).success, true);
      audio = `audio/wav;base64,${tooBig}`;
      const refused = await synthesize({ text: 'Hi' });
      assert.equal(refused.success, false);
      assert.match(refused.error, /decodes to 5121 KB, 5 MB allowed/);
    });
  });
});
