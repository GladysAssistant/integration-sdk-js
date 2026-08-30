const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('movies integrations (contract B.19)', () => {
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

  describe('gladys.onMoviesGetUpcoming(callback)', () => {
    it('should ack movies.get-upcoming with success:true and the resolved pivot movies in data.movies', async () => {
      const requests = [];
      const movies = [
        {
          id: 42,
          title: 'A movie',
          releaseDate: '2026-08-01T00:00:00.000Z',
          overview: 'An overview.',
          posterUrl: 'https://example.com/poster.jpg',
          sourceUrl: 'https://example.com/movie/42',
        },
      ];
      gladys.onMoviesGetUpcoming(async (options) => {
        requests.push(options);
        return movies;
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.MOVIES_GET_UPCOMING, {
        message_id: 'movies-1',
        options: { language: 'fr', region: 'FR', daysAhead: 30 },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'movies-1', success: true, data: { movies } });
      assert.deepEqual(requests, [{ language: 'fr', region: 'FR', daysAhead: 30 }]);
    });

    it('should ack with success:false and the error message when the provider call fails', async () => {
      gladys.onMoviesGetUpcoming(async () => {
        throw new Error('third-party API unreachable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.MOVIES_GET_UPCOMING, {
        message_id: 'movies-2',
        options: { language: 'fr', region: 'FR', daysAhead: 30 },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'movies-2',
        success: false,
        error: 'third-party API unreachable',
      });
    });

    it('should ack with success:false "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.MOVIES_GET_UPCOMING, {
        message_id: 'movies-3',
        options: { language: 'fr', region: 'FR', daysAhead: 30 },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'movies-3', success: false, error: 'not implemented' });
    });
  });

  describe('movies message types (contract B.19)', () => {
    it('should expose the movies message type', () => {
      assert.equal(EXTERNAL_INTEGRATION.MOVIES_GET_UPCOMING, 'external-integration.movies.get-upcoming');
    });
  });
});
