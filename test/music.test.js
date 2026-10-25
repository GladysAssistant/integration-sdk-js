const assert = require('node:assert/strict');
const http = require('node:http');
const { afterEach, beforeEach, describe, it } = require('node:test');

const {
  DEVICE_FEATURE_TYPES,
  MUSIC_MEDIA_TYPES,
  MUSIC_PLAY_MODES,
  MUSIC_PLAYBACK_STATE,
  MUSIC_REPEAT_MODE,
  WEBSOCKET_MESSAGE_TYPES,
  artworkKey,
  validateMediaItems,
} = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');
const { withDebug } = require('./helpers/debug');
const { pngBuffer, pngBase64 } = require('./helpers/images');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;
const { MUSIC } = DEVICE_FEATURE_TYPES;

const PLAYER = 'ext:ext-demo:player:RINCON_1';
const device = { external_id: PLAYER, selector: 'kitchen-speaker', params: [] };
const COVER_URL = 'https://provider.example/covers/kind-of-blue.jpg';

const track = {
  id: 'spotify:track:1',
  type: MUSIC_MEDIA_TYPES.TRACK,
  title: 'Blue in Green',
  subtitle: 'Miles Davis',
  duration: 337,
  artwork_key: artworkKey(COVER_URL),
  browsable: false,
  playable: true,
};

describe('music players (contract capabilities/music.md)', () => {
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

  /** Relay one command and resolve with the ack payload (message_id stripped). */
  const command = async (type, payload) => {
    server.send(type, { message_id: 'm', ...payload });
    const result = { ...(await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT)).payload };
    delete result.message_id;
    return result;
  };

  describe('gladys.onMusicBrowse(callback) — music.browse relay', () => {
    it('should pass the device and the page through (the root as parentId null) and ack { items, total }', async () => {
      const calls = [];
      gladys.onMusicBrowse(async (...args) => {
        calls.push(args);
        return { items: [track], total: 12 };
      });
      await gladys.connect();
      assert.deepEqual(
        await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, parent_id: null, offset: 0, limit: 50 }),
        {
          success: true,
          data: { items: [track], total: 12 },
        },
      );
      await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, parent_id: 'favorites', offset: 50, limit: 50 });
      assert.deepEqual(calls, [
        [device, { parentId: null, offset: 0, limit: 50 }],
        [device, { parentId: 'favorites', offset: 50, limit: 50 }],
      ]);
    });

    it('should leave total out when the handler does not know it', async () => {
      let answer = { items: [], total: undefined };
      gladys.onMusicBrowse(async () => answer);
      await gladys.connect();
      assert.deepEqual((await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, offset: 0, limit: 50 })).data, {
        items: [],
      });
      answer = { items: [], total: null };
      assert.deepEqual((await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, offset: 0, limit: 50 })).data, {
        items: [],
      });
    });

    it('should ack a failure on a value the core could not read, a throw, or without handler', async () => {
      await gladys.connect();
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, offset: 0, limit: 50 }), {
        success: false,
        error: 'not implemented',
      });
      let answer;
      gladys.onMusicBrowse(async () => answer);
      for (const value of [
        undefined,
        [track],
        { items: track },
        { items: [track], total: -1 },
        { items: [], total: 1.5 },
      ]) {
        answer = value;
        const result = await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, offset: 0, limit: 50 });
        assert.equal(result.success, false);
        assert.match(result.error, /^onMusicBrowse: /);
      }
      gladys.onMusicBrowse(async () => {
        throw new Error('provider unreachable');
      });
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, offset: 0, limit: 50 }), {
        success: false,
        error: 'provider unreachable',
      });
    });

    it('should log what the core would drop when DEBUG=gladys-integration-sdk is set, and still ack', async () => {
      gladys.onMusicBrowse(async () => ({ items: [{ id: 'x', type: 'vinyl', title: 'Untyped' }] }));
      await gladys.connect();
      const lines = await withDebug(async () => {
        const result = await command(EXTERNAL_INTEGRATION.MUSIC_BROWSE, { device, offset: 0, limit: 50 });
        assert.equal(result.success, true);
      });
      const issues = lines.filter((line) => line.includes('onMusicBrowse: items[0].type'));
      assert.equal(issues.length, 1);
      assert.match(issues[0], /item dropped by Gladys/);
    });
  });

  describe('gladys.onMusicSearch(callback) — music.search relay', () => {
    it('should pass the query through (the type filter null when absent) and ack { items }', async () => {
      const calls = [];
      gladys.onMusicSearch(async (...args) => {
        calls.push(args);
        return { items: [track], total: 99 };
      });
      await gladys.connect();
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_SEARCH, { device, query: 'jazz', limit: 20 }), {
        success: true,
        data: { items: [track] },
      });
      await command(EXTERNAL_INTEGRATION.MUSIC_SEARCH, { device, query: 'jazz', type: 'playlist', limit: 5 });
      assert.deepEqual(calls, [
        [device, { query: 'jazz', type: null, limit: 20 }],
        [device, { query: 'jazz', type: 'playlist', limit: 5 }],
      ]);
    });
  });

  describe('gladys.onMusicPlay(callback) — music.play relay', () => {
    it('should pass the device, the media and the mode through and ack without data', async () => {
      const calls = [];
      gladys.onMusicPlay(async (...args) => {
        calls.push(args);
      });
      await gladys.connect();
      const media = { id: 'spotify:playlist:1', type: 'playlist' };
      assert.deepEqual(
        await command(EXTERNAL_INTEGRATION.MUSIC_PLAY, { device, media, mode: MUSIC_PLAY_MODES.APPEND }),
        {
          success: true,
        },
      );
      assert.deepEqual(calls, [[device, media, 'append']]);
      gladys.onMusicPlay(async () => {
        throw new Error('player offline');
      });
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_PLAY, { device, media, mode: 'replace' }), {
        success: false,
        error: 'player offline',
      });
    });
  });

  describe('gladys.onMusicQueueGet(callback) — music.queue-get relay', () => {
    it('should ack { items, current_index, total } from the camelCase answer of the handler', async () => {
      const calls = [];
      gladys.onMusicQueueGet(async (...args) => {
        calls.push(args);
        return { items: [track], currentIndex: 3, total: 42 };
      });
      await gladys.connect();
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_QUEUE_GET, { device, offset: 0, limit: 50 }), {
        success: true,
        data: { items: [track], current_index: 3, total: 42 },
      });
      assert.deepEqual(calls, [[device, { offset: 0, limit: 50 }]]);
    });

    it('should accept the wire name current_index too, and read a missing index as null', async () => {
      let answer;
      gladys.onMusicQueueGet(async () => answer);
      await gladys.connect();
      answer = { items: [], current_index: 0, total: 0 };
      assert.deepEqual((await command(EXTERNAL_INTEGRATION.MUSIC_QUEUE_GET, { device, offset: 0, limit: 50 })).data, {
        items: [],
        current_index: 0,
        total: 0,
      });
      answer = { items: [] };
      assert.deepEqual((await command(EXTERNAL_INTEGRATION.MUSIC_QUEUE_GET, { device, offset: 0, limit: 50 })).data, {
        items: [],
        current_index: null,
      });
      answer = { items: [], currentIndex: -1 };
      const result = await command(EXTERNAL_INTEGRATION.MUSIC_QUEUE_GET, { device, offset: 0, limit: 50 });
      assert.equal(result.success, false);
      assert.match(result.error, /"currentIndex" must be a non-negative integer/);
    });
  });

  describe('gladys.onMusicQueuePlay(callback) — music.queue-play relay', () => {
    it('should pass the device and the index through and ack without data', async () => {
      const calls = [];
      gladys.onMusicQueuePlay(async (...args) => {
        calls.push(args);
      });
      await gladys.connect();
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_QUEUE_PLAY, { device, index: 7 }), { success: true });
      assert.deepEqual(calls, [[device, 7]]);
    });
  });

  describe('gladys.onMusicGetArtwork(callback) — music.get-artwork relay', () => {
    it('should ack the raw base64 resolved by a registered handler as data.image', async () => {
      const keys = [];
      gladys.onMusicGetArtwork(async (key) => {
        keys.push(key);
        return pngBase64(64, 64);
      });
      await gladys.connect();
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key: 'art-3f9a2c1b7e4d' }), {
        success: true,
        data: { image: pngBase64(64, 64) },
      });
      assert.deepEqual(keys, ['art-3f9a2c1b7e4d']);
    });

    it('should ack a failure when the handler resolves no image or throws', async () => {
      let image;
      gladys.onMusicGetArtwork(async () => image);
      await gladys.connect();
      for (const value of [undefined, '', 42]) {
        image = value;
        const result = await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key: 'art-1' });
        assert.equal(result.success, false);
        assert.match(result.error, /must be a non-empty RAW base64 string/);
      }
      gladys.onMusicGetArtwork(async () => {
        throw new Error('source down');
      });
      assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key: 'art-1' }), {
        success: false,
        error: 'source down',
      });
    });

    it('should log why the core would refuse the image when DEBUG=gladys-integration-sdk is set', async () => {
      gladys.onMusicGetArtwork(async () => Buffer.from('not an image').toString('base64'));
      await gladys.connect();
      const lines = await withDebug(async () => {
        assert.equal((await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key: 'art-1' })).success, true);
      });
      const issues = lines.filter((line) => line.includes('music artwork "art-1":'));
      assert.equal(issues.length, 1);
      assert.match(issues[0], /not a PNG, JPEG or WebP/);
    });

    describe('the default handler', () => {
      let images;

      beforeEach(async () => {
        images = http.createServer((req, res) => {
          if (req.url === '/cover.png') {
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(pngBuffer(64, 64));
            return;
          }
          res.writeHead(404);
          res.end('gone');
        });
        await new Promise((resolve) => {
          images.listen(0, '127.0.0.1', resolve);
        });
        images.url = `http://127.0.0.1:${images.address().port}`;
      });

      afterEach(async () => {
        await new Promise((resolve) => {
          images.close(resolve);
        });
      });

      it('should serve the bytes of the URL recorded by artworkKey, as raw base64', async () => {
        await gladys.connect();
        const key = gladys.artworkKey(`${images.url}/cover.png`);
        assert.deepEqual(await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key }), {
          success: true,
          data: { image: pngBuffer(64, 64).toString('base64') },
        });
      });

      it('should fail on an unknown key and on an HTTP error', async () => {
        await gladys.connect();
        const unknown = await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key: 'art-000000000000' });
        assert.equal(unknown.success, false);
        assert.match(unknown.error, /unknown artwork key "art-000000000000": no URL recorded by artworkKey/);
        const key = gladys.artworkKey(`${images.url}/missing.png`);
        const missing = await command(EXTERNAL_INTEGRATION.MUSIC_GET_ARTWORK, { key });
        assert.equal(missing.success, false);
        assert.match(missing.error, /artwork fetch failed: HTTP 404 from http:\/\/127\.0\.0\.1/);
      });
    });
  });

  describe('gladys.artworkKey(url)', () => {
    it('should derive a deterministic key of the contract shape, the one of the pure function', () => {
      const key = gladys.artworkKey(COVER_URL);
      assert.match(key, /^art-[0-9a-f]{12}$/);
      assert.equal(key, artworkKey(COVER_URL));
      assert.equal(gladys.artworkKey(COVER_URL), key);
      assert.notEqual(gladys.artworkKey(`${COVER_URL}?size=64`), key);
    });

    it('should refuse anything but a non-empty string', () => {
      for (const value of [undefined, null, '', 42, new URL(COVER_URL)]) {
        assert.throws(() => gladys.artworkKey(value), /"url" must be a non-empty string/);
        assert.throws(() => artworkKey(value), /"url" must be a non-empty string/);
      }
    });

    it('should remember the 1000 most recent URLs, a re-used one counting as recent', () => {
      const first = gladys.artworkKey('https://a/0');
      for (let index = 1; index < 1000; index += 1) {
        gladys.artworkKey(`https://a/${index}`);
      }
      assert.equal(gladys.artworkUrls.size, 1000);
      gladys.artworkKey('https://a/0'); // refreshed: now the most recent
      gladys.artworkKey('https://a/1000'); // evicts https://a/1, the oldest
      assert.equal(gladys.artworkUrls.size, 1000);
      assert.equal(gladys.artworkUrls.get(first), 'https://a/0');
      assert.equal(gladys.artworkUrls.has(artworkKey('https://a/1')), false);
    });
  });

  describe('gladys.publishNowPlaying(deviceExternalId, nowPlaying, options?)', () => {
    const postedStates = () => server.getRequests('POST', '/state').map((request) => request.body.states);
    const feature = (type) => `${PLAYER}:${type}`;

    it('should publish every given value the first time, as ONE batch, texts and numbers mapped', async () => {
      const response = await gladys.publishNowPlaying(PLAYER, {
        playback_state: MUSIC_PLAYBACK_STATE.PLAYING,
        title: 'Blue in Green',
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        artwork_url: COVER_URL,
        duration: 337.4,
        position: 11.6,
        shuffle: false,
        repeat: MUSIC_REPEAT_MODE.ALL,
        mute: true,
        volume: 40,
      });
      assert.deepEqual(response, { success: true, count: 11 });
      assert.deepEqual(postedStates(), [
        [
          { device_feature_external_id: feature(MUSIC.PLAYBACK_STATE), state: 1 },
          { device_feature_external_id: feature(MUSIC.TITLE), text: 'Blue in Green' },
          { device_feature_external_id: feature(MUSIC.ARTIST), text: 'Miles Davis' },
          { device_feature_external_id: feature(MUSIC.ALBUM), text: 'Kind of Blue' },
          { device_feature_external_id: feature(MUSIC.ARTWORK), text: artworkKey(COVER_URL) },
          { device_feature_external_id: feature(MUSIC.DURATION), state: 337 },
          { device_feature_external_id: feature(MUSIC.SHUFFLE), state: 0 },
          { device_feature_external_id: feature(MUSIC.REPEAT), state: 1 },
          { device_feature_external_id: feature(MUSIC.MUTE), state: 1 },
          { device_feature_external_id: feature(MUSIC.VOLUME), state: 40 },
          { device_feature_external_id: feature(MUSIC.POSITION), state: 12 },
        ],
      ]);
      // the artwork URL is recorded for the default artwork handler
      assert.equal(gladys.artworkUrls.get(artworkKey(COVER_URL)), COVER_URL);
    });

    it('should publish only the changed values afterwards, and nothing when nothing changed', async () => {
      await gladys.publishNowPlaying(PLAYER, { playback_state: 1, title: 'A', volume: 40, shuffle: 0 });
      assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { playback_state: 1, volume: 40 }), {
        success: true,
        count: 0,
      });
      assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { volume: 50, shuffle: true, title: 'A' }), {
        success: true,
        count: 2,
      });
      assert.deepEqual(postedStates()[1], [
        { device_feature_external_id: feature(MUSIC.VOLUME), state: 50 },
        { device_feature_external_id: feature(MUSIC.SHUFFLE), state: 1 },
      ]);
      assert.equal(postedStates().length, 2);
    });

    it('should clear the metadata through explicit empty strings and a null artwork, skipping undefined keys', async () => {
      await gladys.publishNowPlaying(PLAYER, { title: 'A', artist: 'B', album: 'C', artwork_url: COVER_URL });
      const response = await gladys.publishNowPlaying(PLAYER, {
        playback_state: MUSIC_PLAYBACK_STATE.IDLE,
        title: '',
        artist: '',
        album: '',
        artwork_url: null,
        volume: undefined,
      });
      assert.deepEqual(response, { success: true, count: 5 });
      assert.deepEqual(postedStates()[1], [
        { device_feature_external_id: feature(MUSIC.PLAYBACK_STATE), state: 2 },
        { device_feature_external_id: feature(MUSIC.TITLE), text: '' },
        { device_feature_external_id: feature(MUSIC.ARTIST), text: '' },
        { device_feature_external_id: feature(MUSIC.ALBUM), text: '' },
        { device_feature_external_id: feature(MUSIC.ARTWORK), text: '' },
      ]);
    });

    it('should truncate the texts at 200 characters like the core does', async () => {
      await gladys.publishNowPlaying(PLAYER, { title: 'x'.repeat(250) });
      assert.equal(postedStates()[0][0].text.length, 200);
      assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { title: `${'x'.repeat(200)}yyy` }), {
        success: true,
        count: 0,
      });
    });

    it('should use the feature external ids given for a convention of its own', async () => {
      await gladys.publishNowPlaying(
        PLAYER,
        { title: 'A', volume: 10 },
        { featureExternalIds: { title: 'ext:ext-demo:player:RINCON_1:track-name' } },
      );
      assert.deepEqual(postedStates()[0], [
        { device_feature_external_id: 'ext:ext-demo:player:RINCON_1:track-name', text: 'A' },
        { device_feature_external_id: feature(MUSIC.VOLUME), state: 10 },
      ]);
    });

    describe('the position sample', () => {
      let now;

      beforeEach((t) => {
        now = Date.parse('2026-10-25T10:00:00.000Z');
        t.mock.method(Date, 'now', () => now);
      });

      it('should not republish a position the dashboard extrapolates itself while playing', async () => {
        await gladys.publishNowPlaying(PLAYER, { playback_state: 1, duration: 300, position: 10 });
        now += 5000;
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { position: 15 }), { success: true, count: 0 });
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { position: 17.9 }), { success: true, count: 0 });
      });

      it('should republish a position deviating by more than 3 s from the extrapolated one (a seek)', async () => {
        await gladys.publishNowPlaying(PLAYER, { playback_state: 1, position: 10 });
        now += 5000;
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { position: 60 }), { success: true, count: 1 });
        assert.deepEqual(postedStates()[1], [{ device_feature_external_id: feature(MUSIC.POSITION), state: 60 }]);
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { position: 5 }), { success: true, count: 1 });
      });

      it('should measure the drift against the PUBLISHED sample, never a skipped one', async () => {
        await gladys.publishNowPlaying(PLAYER, { playback_state: 1, position: 10 });
        now += 2000;
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 11 })).count, 0);
        now += 2000;
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 12 })).count, 0);
        now += 4000;
        // Gladys shows 18, the player says 14: a slow player drifts past the tolerance
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 14 })).count, 1);
      });

      it('should keep the extrapolated position frozen while paused and clamped to the duration', async () => {
        await gladys.publishNowPlaying(PLAYER, { playback_state: MUSIC_PLAYBACK_STATE.PAUSED, position: 30 });
        now += 60000;
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 30 })).count, 0);
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 33 })).count, 0);
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 34 })).count, 1);
        await gladys.publishNowPlaying(PLAYER, { playback_state: 1, duration: 100, position: 95 });
        now += 20000;
        // extrapolated 115, clamped to the 100 s duration: the player at the end is where Gladys shows it
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 100 })).count, 0);
        await gladys.publishNowPlaying(PLAYER, { duration: 0, position: 95 });
        now += 20000;
        // a live stream (duration 0) never clamps
        assert.equal((await gladys.publishNowPlaying(PLAYER, { position: 100 })).count, 1);
      });

      it('should always republish the position with a playback state or a title change', async () => {
        await gladys.publishNowPlaying(PLAYER, { playback_state: 1, title: 'A', position: 10 });
        now += 5000;
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { playback_state: 0, position: 15 }), {
          success: true,
          count: 2,
        });
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { title: 'B', position: 15 }), {
          success: true,
          count: 2,
        });
        // an unchanged title or state does not force it
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { title: 'B', playback_state: 0, position: 15 }), {
          success: true,
          count: 0,
        });
      });

      it('should publish a position that was never published, whatever the rest', async () => {
        await gladys.publishNowPlaying(PLAYER, { playback_state: 1, title: 'A' });
        assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { position: 3 }), { success: true, count: 1 });
      });
    });

    it('should remember a snapshot only once Gladys accepted it, and restore the previous one otherwise', async () => {
      await gladys.publishNowPlaying(PLAYER, { title: 'A', volume: 10 });
      server.forceResponse('POST', '/state', 500, { status: 500, code: 'INTERNAL', message: 'boom' });
      await assert.rejects(gladys.publishNowPlaying(PLAYER, { title: 'B', volume: 20 }), /boom/);
      server.forcedResponses.clear();
      // the refused values are published again by the next call
      assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { title: 'B', volume: 20 }), { success: true, count: 2 });
      // a first publication that fails leaves no snapshot behind
      const other = 'ext:ext-demo:player:RINCON_2';
      server.forceResponse('POST', '/state', 500, { status: 500, code: 'INTERNAL', message: 'boom' });
      await assert.rejects(gladys.publishNowPlaying(other, { title: 'A' }), /boom/);
      server.forcedResponses.clear();
      assert.equal(gladys.nowPlaying.has(other), false);
      assert.deepEqual(await gladys.publishNowPlaying(other, { title: 'A' }), { success: true, count: 1 });
    });

    it('should not undo a forget that happened during a failed request', async (t) => {
      await gladys.publishNowPlaying(PLAYER, { title: 'A' });
      t.mock.method(gladys, 'publishStates', async () => {
        gladys.forgetPublishedStates(PLAYER);
        throw new Error('network down');
      });
      await assert.rejects(gladys.publishNowPlaying(PLAYER, { title: 'B' }), /network down/);
      assert.equal(gladys.nowPlaying.has(PLAYER), false);
    });

    it('should forget the snapshot when the user creates, updates or deletes the device, or on request', async () => {
      await gladys.connect();
      await gladys.publishNowPlaying(PLAYER, { title: 'A' });
      server.send(EXTERNAL_INTEGRATION.DEVICE_UPDATED, { device: { external_id: PLAYER, features: [] } });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      assert.equal(gladys.nowPlaying.has(PLAYER), false);
      await gladys.publishNowPlaying(PLAYER, { title: 'A' });
      gladys.forgetPublishedStates(`${PLAYER}:title`); // a feature id forgets nothing of the player's snapshot
      assert.equal(gladys.nowPlaying.has(PLAYER), true);
      gladys.forgetPublishedStates(PLAYER);
      assert.equal(gladys.nowPlaying.has(PLAYER), false);
      await gladys.publishNowPlaying(PLAYER, { title: 'A' });
      gladys.forgetPublishedStates();
      assert.equal(gladys.nowPlaying.size, 0);
      assert.deepEqual(await gladys.publishNowPlaying(PLAYER, { title: 'A' }), { success: true, count: 1 });
    });

    it('should run in order with publishChangedStates', async () => {
      await Promise.all([
        gladys.publishChangedStates([{ device_feature_external_id: feature(MUSIC.VOLUME), state: 10 }]),
        gladys.publishNowPlaying(PLAYER, { volume: 20 }),
        gladys.publishChangedStates([{ device_feature_external_id: feature(MUSIC.VOLUME), state: 30 }]),
      ]);
      assert.deepEqual(
        postedStates().map((states) => states[0].state),
        [10, 20, 30],
      );
    });

    it('should refuse an invalid player id, snapshot or feature ids before any request', async () => {
      const cases = [
        [['ext:other:player', { title: 'A' }], /"deviceExternalId" must start with "ext:ext-demo:"/],
        [['ext:ext-demo:', { title: 'A' }], /"deviceExternalId" must start with/],
        [[PLAYER, 'A'], /"nowPlaying" must be an object/],
        [[PLAYER, { track: 'A' }], /unknown key "track"/],
        [
          [PLAYER, { playback_state: 4 }],
          /"nowPlaying.playback_state" must be one of MUSIC_PLAYBACK_STATE \(1, 0, 2, 3\)/,
        ],
        [[PLAYER, { title: null }], /"nowPlaying.title" must be a string/],
        [[PLAYER, { artist: 42 }], /"nowPlaying.artist" must be a string/],
        [[PLAYER, { album: ['x'] }], /"nowPlaying.album" must be a string/],
        [[PLAYER, { artwork_url: '' }], /"nowPlaying.artwork_url" must be a non-empty string, or null/],
        [[PLAYER, { artwork_url: 42 }], /"nowPlaying.artwork_url" must be a non-empty string, or null/],
        [[PLAYER, { duration: -1 }], /"nowPlaying.duration" must be a finite number of seconds >= 0/],
        [[PLAYER, { position: Infinity }], /"nowPlaying.position" must be a finite number of seconds >= 0/],
        [[PLAYER, { position: '12' }], /"nowPlaying.position" must be a finite number/],
        [[PLAYER, { shuffle: 2 }], /"nowPlaying.shuffle" must be a boolean \(or 0\/1\)/],
        [[PLAYER, { mute: 'yes' }], /"nowPlaying.mute" must be a boolean \(or 0\/1\)/],
        [[PLAYER, { repeat: 3 }], /"nowPlaying.repeat" must be one of MUSIC_REPEAT_MODE \(0, 1, 2\)/],
        [[PLAYER, { volume: 101 }], /"nowPlaying.volume" must be a number between 0 and 100/],
        [[PLAYER, { volume: NaN }], /"nowPlaying.volume" must be a number between 0 and 100/],
        [[PLAYER, { title: 'A' }, { featureExternalIds: ['x'] }], /"featureExternalIds" must be an object/],
        [
          [PLAYER, { title: 'A' }, { featureExternalIds: { cover: 'ext:ext-demo:x' } }],
          /"featureExternalIds.cover" is not a music feature type/,
        ],
        [
          [PLAYER, { title: 'A' }, { featureExternalIds: { title: 'ext:other:x' } }],
          /"featureExternalIds.title" must be a feature external_id starting with "ext:ext-demo:"/,
        ],
      ];
      for (const [args, expected] of cases) {
        await assert.rejects(gladys.publishNowPlaying(...args), expected);
      }
      assert.equal(server.getRequests('POST', '/state').length, 0);
    });
  });

  describe('validateMediaItems(items)', () => {
    it('should accept items the core keeps unchanged', () => {
      assert.deepEqual(validateMediaItems([track]), []);
      assert.deepEqual(validateMediaItems([{ id: 'favorites', type: 'folder', title: 'Favorites' }]), []);
      assert.deepEqual(
        validateMediaItems([
          { id: 'r', type: 'radio', title: 'FIP', subtitle: null, duration: null, artwork_key: null },
        ]),
        [],
      );
    });

    it('should report a list that is not an array, and the items beyond 100', () => {
      assert.deepEqual(validateMediaItems({ items: [] }), [
        'items: must be an array of MediaItems — read as empty by Gladys',
      ]);
      const many = Array.from({ length: 101 }, (_, index) => ({ id: String(index), type: 'track', title: 'T' }));
      assert.deepEqual(validateMediaItems(many), ['items: 101 items, 100 allowed — the others are dropped']);
      many[100] = 'invalid but beyond the cap';
      assert.deepEqual(validateMediaItems(many), ['items: 101 items, 100 allowed — the others are dropped']);
    });

    it('should report what drops an item and what is truncated or dropped in it', () => {
      assert.deepEqual(
        validateMediaItems([
          'not an object',
          { type: 'track', title: 'No id' },
          { id: 'x'.repeat(513), type: 'track', title: 'Long id' },
          { id: 'a', type: 'track', title: '' },
          { id: 'b', type: 'vinyl', title: 'T' },
          {
            id: 'c',
            type: 'album',
            title: 't'.repeat(201),
            subtitle: 's'.repeat(201),
            duration: 12.5,
            artwork_key: 'https://not-a-key',
            browsable: 'yes',
            playable: 1,
            uri: 'spotify:album:c',
          },
          { id: 'd', type: 'track', title: 'T', subtitle: 42, duration: -1, artwork_key: 42 },
        ]),
        [
          'items[0]: not an object — dropped by Gladys',
          'items[1].id: must be a string of 1-512 characters — item dropped by Gladys',
          'items[2].id: must be a string of 1-512 characters — item dropped by Gladys',
          'items[3].title: must be a non-empty string — item dropped by Gladys',
          'items[4].type: must be one of track, album, artist, playlist, radio, folder — item dropped by Gladys',
          'items[5].title: 201 characters, truncated at 200',
          'items[5].subtitle: 201 characters, truncated at 200',
          'items[5].duration: must be an integer number of seconds >= 0 (or null) — read as null by Gladys',
          'items[5].artwork_key: must match /^[a-z0-9][a-z0-9-]{0,63}$/ (see artworkKey) — dropped by Gladys',
          'items[5].browsable: must be a boolean — read as false by Gladys',
          'items[5].playable: must be a boolean — read as false by Gladys',
          'items[5].uri: unknown field, dropped by Gladys',
          'items[6].subtitle: must be a string — dropped by Gladys',
          'items[6].duration: must be an integer number of seconds >= 0 (or null) — read as null by Gladys',
          'items[6].artwork_key: must match /^[a-z0-9][a-z0-9-]{0,63}$/ (see artworkKey) — dropped by Gladys',
        ],
      );
    });
  });
});
