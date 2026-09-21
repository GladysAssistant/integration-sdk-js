const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const {
  WEBSOCKET_MESSAGE_TYPES,
  WIDGET_COLORS,
  WIDGET_TEXT_VARIANTS,
  WIDGET_CHART_TYPES,
  WIDGET_CHART_INTERVALS,
  WIDGET_CARD_LIST_DISPLAYS,
  WIDGET_IMAGE_FITS,
  WIDGET_BUTTON_STYLES,
} = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');
const { pngBase64 } = require('./helpers/images');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

/**
 * Run a function with DEBUG=gladys-integration-sdk set and console.error
 * captured, and return the captured debug lines.
 */
const withDebug = async (fn) => {
  const originalDebug = process.env.DEBUG;
  const originalError = console.error;
  const lines = [];
  process.env.DEBUG = 'gladys-integration-sdk';
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.error = originalError;
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  }
  return lines;
};

describe('dashboard widgets declared by the manifest', () => {
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

  describe('gladys.onWidgetGet(key, callback) — widget.get relay', () => {
    it('should ack widget.get with the resolved content in data.content', async () => {
      const received = [];
      const content = {
        version: 1,
        ttl_seconds: 30,
        components: [
          { type: 'status', items: [{ label: { en: 'State' }, value: { en: 'Docked' }, color: 'success' }] },
          { type: 'value', label: { en: 'Battery' }, device_feature: 'ext:ext-demo:vacuum:battery' },
          { type: 'button', label: { en: 'Start' }, style: 'primary', action: { key: 'start' } },
        ],
      };
      gladys.onWidgetGet('vacuum', async (options) => {
        received.push(options);
        return content;
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET, {
        message_id: 'wg-1',
        key: 'vacuum',
        settings: { vacuum: 'ext:ext-demo:vacuum' },
        language: 'fr',
        units: 'metric',
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wg-1', success: true, data: { content } });
      assert.deepEqual(received, [{ settings: { vacuum: 'ext:ext-demo:vacuum' }, language: 'fr', units: 'metric' }]);
    });

    it('should dispatch each widget.get to the handler registered for its key', async () => {
      const calls = [];
      gladys.onWidgetGet('vacuum', async () => {
        calls.push('vacuum');
        return { components: [] };
      });
      gladys.onWidgetGet('solar', async () => {
        calls.push('solar');
        return { components: [{ type: 'text', text: 'Sun' }] };
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET, {
        message_id: 'wg-2',
        key: 'solar',
        settings: {},
        language: 'en',
        units: 'us',
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'wg-2',
        success: true,
        data: { content: { components: [{ type: 'text', text: 'Sun' }] } },
      });
      assert.deepEqual(calls, ['solar']);
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onWidgetGet('vacuum', async () => {
        throw new Error('API key invalid');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET, { message_id: 'wg-3', key: 'vacuum', settings: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wg-3', success: false, error: 'API key invalid' });
    });

    it('should ack with "not implemented" when no handler is registered for the key', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET, { message_id: 'wg-4', key: 'unknown', settings: {} });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wg-4', success: false, error: 'not implemented' });
    });

    it('should log what the core would drop when DEBUG=gladys-integration-sdk is set, and still ack', async () => {
      gladys.onWidgetGet('vacuum', async () => ({
        components: [{ type: 'text', text: 'ok' }, { type: 'value' }, { type: 'sparkline' }],
      }));
      await gladys.connect();
      const lines = await withDebug(async () => {
        server.send(EXTERNAL_INTEGRATION.WIDGET_GET, { message_id: 'wg-5', key: 'vacuum', settings: {} });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, true);
      });
      const contentLines = lines.filter((line) => line.includes('widget "vacuum" content:'));
      assert.equal(contentLines.length, 2);
      assert.match(contentLines[0], /components\[1\]\.value: is required/);
      assert.match(contentLines[1], /components\[2\]: has an unknown type "sparkline", dropped/);
    });

    it('should not validate the content when the debug channel is off', async () => {
      gladys.onWidgetGet('vacuum', async () => ({ components: [{ type: 'value' }] }));
      await gladys.connect();
      const originalError = console.error;
      const lines = [];
      console.error = (...args) => lines.push(args.join(' '));
      try {
        server.send(EXTERNAL_INTEGRATION.WIDGET_GET, { message_id: 'wg-6', key: 'vacuum', settings: {} });
        await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      } finally {
        console.error = originalError;
      }
      assert.deepEqual(lines, []);
    });
  });

  describe('gladys.onWidgetGetImage(callback) — widget.get-image relay', () => {
    it('should ack widget.get-image with the resolved raw base64 in data.image', async () => {
      const received = [];
      const image = pngBase64(300, 450);
      gladys.onWidgetGetImage(async (imageKey) => {
        received.push(imageKey);
        return image;
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET_IMAGE, { message_id: 'wi-1', image_key: 'poster-20637522' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wi-1', success: true, data: { image } });
      assert.deepEqual(received, ['poster-20637522']);
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onWidgetGetImage(async () => {
        throw new Error('poster not found');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET_IMAGE, { message_id: 'wi-2', image_key: 'poster-1' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wi-2', success: false, error: 'poster not found' });
    });

    it('should ack with "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_GET_IMAGE, { message_id: 'wi-3', image_key: 'poster-1' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wi-3', success: false, error: 'not implemented' });
    });

    it('should log why the core would refuse the image when DEBUG=gladys-integration-sdk is set', async () => {
      gladys.onWidgetGetImage(async () => Buffer.from('not an image at all').toString('base64'));
      await gladys.connect();
      const lines = await withDebug(async () => {
        server.send(EXTERNAL_INTEGRATION.WIDGET_GET_IMAGE, { message_id: 'wi-4', image_key: 'poster-1' });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, true);
      });
      const imageLines = lines.filter((line) => line.includes('widget image "poster-1":'));
      assert.equal(imageLines.length, 1);
      assert.match(imageLines[0], /not a PNG, JPEG or WebP/);
    });
  });

  describe('gladys.onWidgetAction(key, callback) — widget.action relay', () => {
    it('should relay the action key, the declared params and the settings, and ack a string message', async () => {
      const received = [];
      gladys.onWidgetAction('vacuum', async (actionKey, params, options) => {
        received.push([actionKey, params, options]);
        return 'Cleaning started';
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, {
        message_id: 'wa-1',
        key: 'vacuum',
        action_key: 'start',
        params: { mode: 'full' },
        settings: { vacuum: 'ext:ext-demo:vacuum' },
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wa-1', success: true, data: { message: 'Cleaning started' } });
      assert.deepEqual(received, [['start', { mode: 'full' }, { settings: { vacuum: 'ext:ext-demo:vacuum' } }]]);
    });

    it('should ack a multi-language object as the message', async () => {
      gladys.onWidgetAction('vacuum', async () => ({ en: 'Cleaning started', fr: 'Nettoyage lancé' }));
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { message_id: 'wa-2', key: 'vacuum', action_key: 'start' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'wa-2',
        success: true,
        data: { message: { en: 'Cleaning started', fr: 'Nettoyage lancé' } },
      });
    });

    it('should ack an explicit { message } wrapper', async () => {
      gladys.onWidgetAction('vacuum', async () => ({ message: { en: 'Docking' } }));
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { message_id: 'wa-3', key: 'vacuum', action_key: 'dock' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wa-3', success: true, data: { message: { en: 'Docking' } } });
    });

    it('should ack without data when the handler resolves undefined (no toast)', async () => {
      gladys.onWidgetAction('vacuum', async () => {});
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { message_id: 'wa-4', key: 'vacuum', action_key: 'start' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wa-4', success: true });
    });

    it('should ack with success:false when the resolved message is neither a string nor an object', async () => {
      gladys.onWidgetAction('vacuum', async () => 42);
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { message_id: 'wa-5', key: 'vacuum', action_key: 'start' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.equal(result.payload.success, false);
      assert.match(result.payload.error, /resolved message must be a string/);
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onWidgetAction('vacuum', async () => {
        throw new Error('robot unreachable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { message_id: 'wa-6', key: 'vacuum', action_key: 'start' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wa-6', success: false, error: 'robot unreachable' });
    });

    it('should ack with "not implemented" when no handler is registered for the widget key', async () => {
      gladys.onWidgetAction('solar', async () => 'ok');
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.WIDGET_ACTION, { message_id: 'wa-7', key: 'vacuum', action_key: 'start' });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'wa-7', success: false, error: 'not implemented' });
    });
  });

  describe('gladys.requestWidgetRefresh(key)', () => {
    it('should send a widget.refresh message carrying the key, without message_id', async () => {
      await gladys.connect();
      gladys.requestWidgetRefresh('vacuum');
      const message = await server.waitForWsMessage(EXTERNAL_INTEGRATION.WIDGET_REFRESH);
      assert.deepEqual(message, { type: 'external-integration.widget.refresh', payload: { key: 'vacuum' } });
    });

    it('should drop the nudge silently while disconnected', async () => {
      gladys.requestWidgetRefresh('vacuum');
      await gladys.connect();
      await delay(50);
      assert.deepEqual(server.wsMessages, []);
    });

    it('should reject a key that is not a declarable widget key', () => {
      assert.throws(() => gladys.requestWidgetRefresh(''), /"key" must be a widget key/);
      assert.throws(() => gladys.requestWidgetRefresh('Not-A-Key'), /"key" must be a widget key/);
      assert.throws(() => gladys.requestWidgetRefresh(undefined), /"key" must be a widget key/);
    });
  });

  describe('constants', () => {
    it('should expose the widget message types of contract C.4', () => {
      assert.equal(EXTERNAL_INTEGRATION.WIDGET_GET, 'external-integration.widget.get');
      assert.equal(EXTERNAL_INTEGRATION.WIDGET_GET_IMAGE, 'external-integration.widget.get-image');
      assert.equal(EXTERNAL_INTEGRATION.WIDGET_ACTION, 'external-integration.widget.action');
      assert.equal(EXTERNAL_INTEGRATION.WIDGET_REFRESH, 'external-integration.widget.refresh');
    });

    it('should expose the content vocabulary enums', () => {
      assert.deepEqual(Object.values(WIDGET_COLORS), ['neutral', 'primary', 'success', 'warning', 'danger', 'info']);
      assert.deepEqual(Object.values(WIDGET_TEXT_VARIANTS), ['heading', 'body', 'caption']);
      assert.deepEqual(Object.values(WIDGET_CHART_TYPES), ['line', 'area', 'bar', 'stepline']);
      assert.deepEqual(Object.values(WIDGET_CHART_INTERVALS), [
        'last-hour',
        'last-twelve-hours',
        'last-day',
        'last-three-days',
        'last-week',
        'last-month',
        'last-three-months',
        'last-year',
      ]);
      assert.deepEqual(Object.values(WIDGET_CARD_LIST_DISPLAYS), ['grid', 'list']);
      assert.deepEqual(Object.values(WIDGET_IMAGE_FITS), ['cover', 'contain']);
      assert.deepEqual(Object.values(WIDGET_BUTTON_STYLES), ['primary', 'secondary', 'danger']);
    });
  });
});
