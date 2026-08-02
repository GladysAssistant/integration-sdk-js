const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEATHER_CONDITIONS, WEATHER_ALERT_SEVERITIES, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('weather integrations (contract B.18)', () => {
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

  describe('gladys.onWeatherGet(callback)', () => {
    it('should ack weather.get with success:true and the resolved pivot weather in data.weather', async () => {
      const requests = [];
      const weather = {
        temperature: 21.5,
        weather: WEATHER_CONDITIONS.RAIN,
        datetime: '2026-08-01T12:00:00.000Z',
        humidity: 80,
        wind_speed: 4.2,
        hours: [
          {
            temperature: 20.1,
            weather: WEATHER_CONDITIONS.DRIZZLE,
            datetime: '2026-08-01T13:00:00.000Z',
            precipitation_probability: 60,
          },
        ],
        days: [
          {
            temperature_min: 14,
            temperature_max: 24,
            datetime: '2026-08-02T00:00:00.000Z',
            weather: WEATHER_CONDITIONS.CLEAR,
          },
        ],
        alerts: [
          {
            severity: WEATHER_ALERT_SEVERITIES.SEVERE,
            event: 'Orages violents',
            start: '2026-08-01T16:00:00.000Z',
            end: '2026-08-01T22:00:00.000Z',
          },
        ],
      };
      gladys.onWeatherGet(async (options) => {
        requests.push(options);
        return weather;
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEATHER_GET, {
        message_id: 'weather-1',
        options: { latitude: 48.85, longitude: 2.35, language: 'fr', units: 'metric' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'weather-1', success: true, data: { weather } });
      assert.deepEqual(requests, [{ latitude: 48.85, longitude: 2.35, language: 'fr', units: 'metric' }]);
    });

    it('should pass the us unit system through to the handler', async () => {
      const requests = [];
      gladys.onWeatherGet(async (options) => {
        requests.push(options);
        return { temperature: 71.6, weather: WEATHER_CONDITIONS.CLEAR, datetime: '2026-08-01T12:00:00.000Z' };
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEATHER_GET, {
        message_id: 'weather-2',
        options: { latitude: 40.71, longitude: -74.01, language: 'en', units: 'us' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.equal(result.payload.success, true);
      assert.equal(requests[0].units, 'us');
    });

    it('should ack with success:false and the error message when the provider call fails', async () => {
      gladys.onWeatherGet(async () => {
        throw new Error('third-party API unreachable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEATHER_GET, {
        message_id: 'weather-3',
        options: { latitude: 48.85, longitude: 2.35, language: 'fr', units: 'metric' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'weather-3',
        success: false,
        error: 'third-party API unreachable',
      });
    });

    it('should ack with success:false "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WEATHER_GET, {
        message_id: 'weather-4',
        options: { latitude: 48.85, longitude: 2.35, language: 'fr', units: 'metric' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'weather-4', success: false, error: 'not implemented' });
    });
  });

  describe('weather constants (contract B.18)', () => {
    it('should expose the condition enum of the pivot weather format', () => {
      assert.deepEqual(Object.values(WEATHER_CONDITIONS), [
        'clear',
        'cloud',
        'fog',
        'drizzle',
        'rain',
        'sleet',
        'snow',
        'thunderstorm',
        'wind',
        'night',
        'unknown',
      ]);
    });

    it('should expose the CAP-style alert severities', () => {
      assert.deepEqual(Object.values(WEATHER_ALERT_SEVERITIES), ['minor', 'moderate', 'severe', 'extreme']);
    });

    it('should expose the weather.get message type', () => {
      assert.equal(EXTERNAL_INTEGRATION.WEATHER_GET, 'external-integration.weather.get');
    });
  });
});
