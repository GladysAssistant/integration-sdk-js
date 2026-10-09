const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, deferred } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

const TEMPERATURE = 'ext:ext-demo:sensor:1:temperature';
const HUMIDITY = 'ext:ext-demo:sensor:1:humidity';

describe('gladys.publishChangedStates(states, options?)', () => {
  let server;
  let gladys;

  const postedStates = () => server.getRequests('POST', '/state').map((request) => request.body.states);

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  it('should publish every state the first time', async () => {
    const states = [
      { device_feature_external_id: TEMPERATURE, state: 21.5 },
      { device_feature_external_id: HUMIDITY, state: 40 },
    ];
    assert.deepEqual(await gladys.publishChangedStates(states), { success: true, count: 2 });
    assert.deepEqual(postedStates(), [states]);
  });

  it('should send no request when nothing changed', async () => {
    const states = [{ device_feature_external_id: TEMPERATURE, state: 21.5 }];
    await gladys.publishChangedStates(states);
    assert.deepEqual(await gladys.publishChangedStates(states), { success: true, count: 0 });
    assert.equal(postedStates().length, 1);
  });

  it('should publish only the values that changed', async () => {
    await gladys.publishChangedStates([
      { device_feature_external_id: TEMPERATURE, state: 21.5 },
      { device_feature_external_id: HUMIDITY, state: 40 },
    ]);
    const response = await gladys.publishChangedStates([
      { device_feature_external_id: TEMPERATURE, state: 21.5 },
      { device_feature_external_id: HUMIDITY, state: 41 },
    ]);
    assert.deepEqual(response, { success: true, count: 1 });
    assert.deepEqual(postedStates()[1], [{ device_feature_external_id: HUMIDITY, state: 41 }]);
  });

  it('should compare text states too', async () => {
    const status = 'ext:ext-demo:sensor:1:status';
    await gladys.publishChangedStates([{ device_feature_external_id: status, text: 'idle' }]);
    await gladys.publishChangedStates([{ device_feature_external_id: status, text: 'idle' }]);
    await gladys.publishChangedStates([{ device_feature_external_id: status, text: 'cleaning' }]);
    assert.deepEqual(postedStates(), [
      [{ device_feature_external_id: status, text: 'idle' }],
      [{ device_feature_external_id: status, text: 'cleaning' }],
    ]);
  });

  it('should skip the repeated values of a feature within the same call', async () => {
    const response = await gladys.publishChangedStates([
      { device_feature_external_id: TEMPERATURE, state: 21 },
      { device_feature_external_id: TEMPERATURE, state: 21 },
      { device_feature_external_id: TEMPERATURE, state: 22 },
    ]);
    assert.equal(response.count, 2);
    assert.deepEqual(postedStates(), [
      [
        { device_feature_external_id: TEMPERATURE, state: 21 },
        { device_feature_external_id: TEMPERATURE, state: 22 },
      ],
    ]);
  });

  it('should re-publish an unchanged value once older than the heartbeat', async (t) => {
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);
    const states = [{ device_feature_external_id: TEMPERATURE, state: 21.5 }];
    await gladys.publishChangedStates(states, { heartbeat: 60_000 });
    now += 59_999;
    assert.equal((await gladys.publishChangedStates(states, { heartbeat: 60_000 })).count, 0);
    now += 1;
    assert.equal((await gladys.publishChangedStates(states, { heartbeat: 60_000 })).count, 1);
    // Without the heartbeat option, an unchanged value is never re-sent.
    now += 3_600_000;
    assert.equal((await gladys.publishChangedStates(states)).count, 0);
    assert.equal(postedStates().length, 2);
  });

  it('should split the batches above 100 states', async () => {
    const states = Array.from({ length: 150 }, (_, index) => ({
      device_feature_external_id: `ext:ext-demo:sensor:${index}:temperature`,
      state: index,
    }));
    assert.deepEqual(await gladys.publishChangedStates(states), { success: true, count: 150 });
    assert.deepEqual(
      postedStates().map((batch) => batch.length),
      [100, 50],
    );
  });

  it('should throw and re-send the states of a request Gladys refused', async () => {
    const states = [{ device_feature_external_id: TEMPERATURE, state: 21.5 }];
    server.forceResponse('POST', '/state', 429, {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'RATE_LIMIT_EXCEEDED: max 300 states per minute',
    });
    await assert.rejects(gladys.publishChangedStates(states), (error) => {
      assert.ok(error instanceof GladysApiError);
      assert.equal(error.status, 429);
      return true;
    });
    server.forcedResponses.delete('POST /state');
    assert.deepEqual(await gladys.publishChangedStates(states), { success: true, count: 1 });
  });

  it('should remember the batches Gladys accepted before a failed one', async (t) => {
    const states = Array.from({ length: 150 }, (_, index) => ({
      device_feature_external_id: `ext:ext-demo:sensor:${index}:temperature`,
      state: index,
    }));
    let calls = 0;
    const publishStates = t.mock.method(gladys, 'publishStates', async () => {
      calls += 1;
      if (calls === 2) {
        throw new Error('fetch failed');
      }
      return { success: true };
    });
    await assert.rejects(gladys.publishChangedStates(states), /fetch failed/);
    // Only the 50 states of the failed batch are sent again.
    assert.deepEqual(await gladys.publishChangedStates(states), { success: true, count: 50 });
    assert.deepEqual(publishStates.mock.calls[2].arguments[0], states.slice(100));
  });

  it('should not publish twice the same value from two concurrent calls', async () => {
    const states = [{ device_feature_external_id: TEMPERATURE, state: 21.5 }];
    const [first, second] = await Promise.all([
      gladys.publishChangedStates(states),
      gladys.publishChangedStates(states),
    ]);
    assert.equal(first.count + second.count, 1);
    assert.equal(postedStates().length, 1);
  });

  it('should run overlapping calls one after the other, in call order', async (t) => {
    const gate = deferred();
    const sent = [];
    t.mock.method(gladys, 'publishStates', async (batch) => {
      sent.push(batch.map(({ state }) => state));
      if (sent.length === 1) {
        await gate.promise;
      }
      return { success: true };
    });
    const first = gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 21 }]);
    const second = gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 22 }]);
    await new Promise(setImmediate);
    // The second request waits for the first one to be answered.
    assert.deepEqual(sent, [[21]]);
    gate.resolve();
    assert.deepEqual(await Promise.all([first, second]), [
      { success: true, count: 1 },
      { success: true, count: 1 },
    ]);
    assert.deepEqual(sent, [[21], [22]]);
    // The memory matches the last value Gladys received.
    assert.equal(
      (await gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 22 }])).count,
      0,
    );
  });

  it('should not let a failed call block the next one', async (t) => {
    let calls = 0;
    t.mock.method(gladys, 'publishStates', async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('fetch failed');
      }
      return { success: true };
    });
    const first = gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 21 }]);
    const second = gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 22 }]);
    await assert.rejects(first, /fetch failed/);
    assert.deepEqual(await second, { success: true, count: 1 });
  });

  it('should keep a value forgotten while its request was in flight forgotten', async (t) => {
    const gate = deferred();
    t.mock.method(gladys, 'publishStates', async () => {
      await gate.promise;
      return { success: true };
    });
    const states = [{ device_feature_external_id: TEMPERATURE, state: 21 }];
    const pending = gladys.publishChangedStates(states);
    await new Promise(setImmediate);
    // E.g. the device is created while the state is on its way: Gladys may
    // have dropped it.
    gladys.forgetPublishedStates('ext:ext-demo:sensor:1');
    gate.resolve();
    await pending;
    assert.equal((await gladys.publishChangedStates(states)).count, 1);
  });

  it('should throw when states is not an array', async () => {
    await assert.rejects(gladys.publishChangedStates({ state: 1 }), /"states" must be an array/);
  });

  it('should throw when a state carries no device_feature_external_id', async () => {
    await assert.rejects(gladys.publishChangedStates([null]), /every state must carry a "device_feature_external_id"/);
    await assert.rejects(gladys.publishChangedStates([{ state: 1 }]), /every state must carry/);
    assert.equal(postedStates().length, 0);
  });

  it('should throw when heartbeat is not a positive number', async () => {
    const states = [{ device_feature_external_id: TEMPERATURE, state: 1 }];
    await assert.rejects(
      gladys.publishChangedStates(states, { heartbeat: 0 }),
      /"heartbeat" must be a positive number/,
    );
    await assert.rejects(gladys.publishChangedStates(states, { heartbeat: '60000' }), /"heartbeat" must be a positive/);
    await assert.rejects(gladys.publishChangedStates(states, { heartbeat: NaN }), /"heartbeat" must be a positive/);
  });

  describe('gladys.forgetPublishedStates(externalId?)', () => {
    const states = [
      { device_feature_external_id: 'ext:ext-demo:sensor:1:temperature', state: 21 },
      { device_feature_external_id: 'ext:ext-demo:sensor:1:humidity', state: 40 },
      { device_feature_external_id: 'ext:ext-demo:sensor:10:temperature', state: 18 },
    ];

    it('should forget everything without argument', async () => {
      await gladys.publishChangedStates(states);
      gladys.forgetPublishedStates();
      assert.equal((await gladys.publishChangedStates(states)).count, 3);
    });

    it('should forget every feature of a device, and only them', async () => {
      await gladys.publishChangedStates(states);
      gladys.forgetPublishedStates('ext:ext-demo:sensor:1');
      await gladys.publishChangedStates(states);
      assert.deepEqual(postedStates()[1], states.slice(0, 2));
    });

    it('should forget one feature', async () => {
      await gladys.publishChangedStates(states);
      gladys.forgetPublishedStates('ext:ext-demo:sensor:1:humidity');
      await gladys.publishChangedStates(states);
      assert.deepEqual(postedStates()[1], [states[1]]);
    });
  });

  describe('device lifecycle events', () => {
    for (const [type, handler] of [
      [EXTERNAL_INTEGRATION.DEVICE_CREATED, 'onDeviceCreated'],
      [EXTERNAL_INTEGRATION.DEVICE_UPDATED, 'onDeviceUpdated'],
      [EXTERNAL_INTEGRATION.DEVICE_DELETED, 'onDeviceDeleted'],
    ]) {
      it(`should forget the values of the device on ${type}`, async () => {
        // A feature external_id outside the `<device>:` namespace is matched
        // through the features of the event.
        const outside = 'ext:ext-demo:legacy-temperature';
        const states = [
          { device_feature_external_id: TEMPERATURE, state: 21 },
          { device_feature_external_id: outside, state: 18 },
          { device_feature_external_id: 'ext:ext-demo:sensor:2:temperature', state: 19 },
        ];
        const { promise: handled, resolve } = deferred();
        gladys[handler](resolve);
        await gladys.connect();
        await gladys.publishChangedStates(states);
        server.send(type, {
          device: {
            external_id: 'ext:ext-demo:sensor:1',
            name: 'Sensor',
            features: [{ external_id: TEMPERATURE }, { external_id: outside }],
          },
        });
        await handled;
        await gladys.publishChangedStates(states);
        assert.deepEqual(postedStates()[1], states.slice(0, 2));
      });
    }

    it('should handle a device event carrying no features', async () => {
      const { promise: handled, resolve } = deferred();
      gladys.onDeviceDeleted(resolve);
      await gladys.connect();
      await gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 21 }]);
      server.send(EXTERNAL_INTEGRATION.DEVICE_DELETED, { device: { external_id: 'ext:ext-demo:sensor:1' } });
      await handled;
      assert.equal(
        (await gladys.publishChangedStates([{ device_feature_external_id: TEMPERATURE, state: 21 }])).count,
        1,
      );
    });
  });
});
