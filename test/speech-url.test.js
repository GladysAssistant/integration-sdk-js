const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError } = require('../lib');
const { SPEECH_URL_REQUEST_TIMEOUT } = require('../lib/constants');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe("the instance's voice for the integration's player (gladys.getSpeechUrl)", () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should POST /tts/speech_url with the text and resolve with the URL of the clip', async () => {
    const url = await gladys.getSpeechUrl('Bonjour !');
    assert.equal(url, 'http://192.168.1.10:80/api/v1/tts/audio/0123abcd.mp3');
    const requests = server.getRequests('POST', '/tts/speech_url');
    // no language: the core picks the first administrator's
    assert.deepEqual(requests[0].body, { text: 'Bonjour !' });
    assert.equal(requests[0].authorization, `Bearer ${server.token}`);
  });

  it('should send the language when given, and nothing for a null one', async () => {
    await gladys.getSpeechUrl('Bonjour !', { language: 'fr' });
    await gladys.getSpeechUrl('Hello', { language: 'en-US' });
    await gladys.getSpeechUrl('Olá', { language: 'pt_BR' });
    await gladys.getSpeechUrl('Hallo', { language: null });
    assert.deepEqual(
      server.getRequests('POST', '/tts/speech_url').map((request) => request.body),
      [
        { text: 'Bonjour !', language: 'fr' },
        { text: 'Hello', language: 'en-US' },
        { text: 'Olá', language: 'pt_BR' },
        { text: 'Hallo' },
      ],
    );
  });

  it('should accept a text of exactly 2,000 characters', async () => {
    await gladys.getSpeechUrl('a'.repeat(2000));
    assert.equal(server.getRequests('POST', '/tts/speech_url').length, 1);
  });

  it('should reject a missing, blank or oversized text, without any HTTP request', async () => {
    // The core answers 400 to all of these: the SDK fails fast with a local Error.
    for (const text of [undefined, null, 42, '', '   \n', 'a'.repeat(2001)]) {
      await assert.rejects(gladys.getSpeechUrl(text), /"text" must be a non-blank string of at most 2000 characters/);
    }
    assert.equal(server.getRequests('POST', '/tts/speech_url').length, 0);
  });

  it('should reject malformed options and language tags, without any HTTP request', async () => {
    await assert.rejects(gladys.getSpeechUrl('Hi', null), /"options" must be an object/);
    await assert.rejects(gladys.getSpeechUrl('Hi', 'fr'), /"options" must be an object/);
    for (const language of [42, '', 'f', 'fr; rm -rf /', `fr-${'a'.repeat(9)}`]) {
      await assert.rejects(gladys.getSpeechUrl('Hi', { language }), /"language" must be a language tag/);
    }
    assert.equal(server.getRequests('POST', '/tts/speech_url').length, 0);
  });

  it('should reject with the 503 GladysApiError of the core when the voice cannot speak', async () => {
    server.forceResponse('POST', '/tts/speech_url', 503, {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'TTS_UNAVAILABLE',
    });
    await assert.rejects(gladys.getSpeechUrl('Bonjour !'), (error) => {
      assert.ok(error instanceof GladysApiError);
      assert.equal(error.status, 503);
      assert.equal(error.code, 'SERVICE_UNAVAILABLE');
      assert.equal(error.message, 'TTS_UNAVAILABLE');
      return true;
    });
  });

  it('should reject with the 429 GladysApiError of the core past its rate limit', async () => {
    server.forceResponse('POST', '/tts/speech_url', 429, {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      properties: { time_before_next: 42 },
    });
    await assert.rejects(gladys.getSpeechUrl('Bonjour !'), (error) => {
      assert.ok(error instanceof GladysApiError);
      assert.equal(error.status, 429);
      return true;
    });
  });

  it('should wait for a local synthesis longer than the host API request timeout', async () => {
    // A client aborting ordinary requests after 100 ms still waits for the
    // speech URL: a local engine may take the core's whole 30 s deadline.
    const impatient = createClient(server, { requestTimeout: 100 });
    server.delayedRoutes.set('POST /tts/speech_url', 300);
    const url = await impatient.getSpeechUrl('Bonjour !');
    assert.equal(url, 'http://192.168.1.10:80/api/v1/tts/audio/0123abcd.mp3');
    server.delayedRoutes.set('GET /status', 300);
    await assert.rejects(impatient.getStatus(), /aborted|timeout/i);
  });

  it('should give the speech URL request at least 35 s, and more when requestTimeout says so', async () => {
    const timeouts = [];
    const record = (client) => {
      client.httpClient.post = async (path, body, options) => {
        timeouts.push([path, options.timeout]);
        return { url: 'http://192.168.1.10:80/api/v1/tts/audio/0123abcd.mp3' };
      };
      return client;
    };
    await record(createClient(server)).getSpeechUrl('Bonjour !');
    await record(createClient(server, { requestTimeout: 60 * 1000 })).getSpeechUrl('Bonjour !');
    assert.equal(SPEECH_URL_REQUEST_TIMEOUT, 35 * 1000);
    assert.deepEqual(timeouts, [
      ['/tts/speech_url', 35 * 1000],
      ['/tts/speech_url', 60 * 1000],
    ]);
  });
});
