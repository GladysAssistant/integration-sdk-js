const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, once } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

const CONTRACT = {
  id: 'contract-1',
  template_key: 'octopus-agile',
  inputs: { region: 'A' },
  currency: 'GBP',
  timezone: 'Europe/London',
  billing_period_start_day: 1,
};
const BILLING_PERIOD = { starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2026-02-01T00:00:00.000Z' };
const INTERVALS = [
  { starts_at: '2026-01-12T05:00:00.000Z', kwh: 1.2, max_power_kw: 2.4 },
  { starts_at: '2026-01-12T05:30:00.000Z', kwh: 0.4, max_power_kw: 0.8 },
];

describe('energy contracts capability (manifest energy_contracts)', () => {
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

  describe('gladys.publishEnergyCalendar(key, entries)', () => {
    it('should POST /energy/calendar with the key and the whitelisted entries, dates serialized', async () => {
      const result = await gladys.publishEnergyCalendar('hq-critical-peaks', [
        { date: '2026-01-12', value: 'critical-peak', extra: 'dropped' },
        { starts_at: new Date('2026-01-13T05:00:00.000Z'), value: 'normal', price: null },
        { starts_at: '2026-01-14T05:00:00Z', price: 0.1823, currency: 'CAD', date: null, value: undefined },
        { starts_at: '2026-01-15T05:00:00Z', price: -3, currency: null },
      ]);
      assert.deepEqual(result, { success: true, count: 4, changed_from: '2026-01-12T05:00:00.000Z' });
      const [request] = server.getRequests('POST', '/energy/calendar');
      assert.equal(request.authorization, `Bearer ${server.token}`);
      assert.deepEqual(request.body, {
        calendar_key: 'hq-critical-peaks',
        entries: [
          { date: '2026-01-12', value: 'critical-peak' },
          { starts_at: '2026-01-13T05:00:00.000Z', value: 'normal' },
          { starts_at: '2026-01-14T05:00:00Z', price: 0.1823, currency: 'CAD' },
          { starts_at: '2026-01-15T05:00:00Z', price: -3 },
        ],
      });
    });

    it('should reject an invalid key or list before any request', async () => {
      const keyError = /"key" must be a calendar key declared in the manifest/;
      await assert.rejects(gladys.publishEnergyCalendar('', []), keyError);
      await assert.rejects(gladys.publishEnergyCalendar('Spot FR', []), keyError);
      await assert.rejects(gladys.publishEnergyCalendar('-spot', []), keyError);
      await assert.rejects(gladys.publishEnergyCalendar(`a${'b'.repeat(64)}`, []), keyError);
      await assert.rejects(gladys.publishEnergyCalendar('tempo', []), /"entries" must be a non-empty array/);
      await assert.rejects(gladys.publishEnergyCalendar('tempo', {}), /"entries" must be a non-empty array/);
      await assert.rejects(
        gladys.publishEnergyCalendar(
          'tempo',
          Array.from({ length: 2001 }, (_, i) => ({ starts_at: new Date(i * 60000).toISOString(), price: 1 })),
        ),
        /maximum 2000 entries per request/,
      );
      await assert.rejects(gladys.publishEnergyCalendar('tempo', [42]), /"entries\[0\]" must be an object/);
      assert.equal(server.getRequests('POST', '/energy/calendar').length, 0);
    });

    it('should require exactly one start and exactly one value per entry', async () => {
      const startError = /"entries\[0\]" must carry exactly one of "starts_at" \(ISO date\) or "date"/;
      await assert.rejects(gladys.publishEnergyCalendar('tempo', [{ value: 'red' }]), startError);
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [
          { date: '2026-01-12', starts_at: '2026-01-12T05:00:00Z', value: 'red' },
        ]),
        startError,
      );
      const valueError = /"entries\[0\]" must carry exactly one of "value" \(a declared string value\) or "price"/;
      await assert.rejects(gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12' }]), valueError);
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12', value: 'red', price: 1 }]),
        valueError,
      );
      assert.equal(server.getRequests('POST', '/energy/calendar').length, 0);
    });

    it('should enforce the date, starts_at, value, price and currency shapes', async () => {
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: '12/01/2026', value: 'red' }]),
        /"entries\[0\]\.date" must be a YYYY-MM-DD date/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: 20260112, value: 'red' }]),
        /"entries\[0\]\.date" must be a YYYY-MM-DD date/,
      );
      // A month or a day out of range, or a date that does not exist (rolled
      // over by Date.parse), never leaves the integration.
      for (const date of ['2026-13-01', '2026-01-32', '2026-02-30']) {
        await assert.rejects(
          gladys.publishEnergyCalendar('tempo', [{ date, value: 'red' }]),
          /"entries\[0\]\.date" must be a YYYY-MM-DD date that exists/,
          date,
        );
      }
      await gladys.publishEnergyCalendar('tempo', [{ date: '2024-02-29', value: 'red' }]);
      assert.equal(server.getRequests('POST', '/energy/calendar').length, 1);
      server.requests = [];
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ starts_at: 'monday', value: 'red' }]),
        /"entries\[0\]\.starts_at" must be an ISO 8601 date string or a Date/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12', value: '' }]),
        /"entries\[0\]\.value" must be a string of 1-64 characters/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12', value: 'x'.repeat(65) }]),
        /"entries\[0\]\.value" must be a string of 1-64 characters/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12', value: 3 }]),
        /"entries\[0\]\.value" must be a string of 1-64 characters/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('spot-fr', [{ starts_at: '2026-01-12T05:00:00Z', price: '0.18' }]),
        /"entries\[0\]\.price" must be a finite number/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('spot-fr', [{ starts_at: '2026-01-12T05:00:00Z', price: Infinity }]),
        /"entries\[0\]\.price" must be a finite number/,
      );
      await assert.rejects(
        gladys.publishEnergyCalendar('spot-fr', [{ starts_at: '2026-01-12T05:00:00Z', price: 0.18, currency: 978 }]),
        /"entries\[0\]\.currency" must be an ISO 4217 code/,
      );
      assert.equal(server.getRequests('POST', '/energy/calendar').length, 0);
    });

    it('should throw a GladysApiError on a key the manifest does not declare (403) and a refused entry (400)', async () => {
      server.forceResponse('POST', '/energy/calendar', 403, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'calendar "tempo" is not declared by this integration',
      });
      await assert.rejects(gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12', value: 'red' }]), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 403);
        return true;
      });
      server.forceResponse('POST', '/energy/calendar', 400, {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'entries[0].value: "purple" is not in [blue, white, red]',
      });
      await assert.rejects(
        gladys.publishEnergyCalendar('tempo', [{ date: '2026-01-12', value: 'purple' }]),
        (error) => {
          assert.equal(error.status, 400);
          assert.match(error.message, /not in \[blue, white, red\]/);
          return true;
        },
      );
    });
  });

  describe('gladys.getEnergyCalendar(key, options?)', () => {
    it('should GET /energy/calendar/:key and resolve with the entries', async () => {
      server.energyCalendarEntries = [{ starts_at: '2026-01-12T05:00:00.000Z', value: 'red' }];
      assert.deepEqual(await gladys.getEnergyCalendar('tempo'), server.energyCalendarEntries);
      const [request] = server.getRequests('GET', '/energy/calendar/tempo');
      assert.deepEqual(request.query, {});
      assert.equal(request.authorization, `Bearer ${server.token}`);
    });

    it('should pass the window and the limit as query parameters, dates serialized', async () => {
      await gladys.getEnergyCalendar('spot-fr', {
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: '2026-02-01T00:00:00Z',
        limit: 10,
      });
      await gladys.getEnergyCalendar('spot-fr', { limit: 1 });
      const requests = server.getRequests('GET', '/energy/calendar/spot-fr');
      assert.deepEqual(requests[0].query, {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00Z',
        limit: '10',
      });
      assert.deepEqual(requests[1].query, { limit: '1' });
    });

    it('should reject an invalid key, window or limit before any request', async () => {
      await assert.rejects(gladys.getEnergyCalendar('Tempo'), /"key" must be a calendar key declared in the manifest/);
      await assert.rejects(
        gladys.getEnergyCalendar('tempo', { from: 'january' }),
        /"from" must be an ISO 8601 date string or a Date/,
      );
      await assert.rejects(
        gladys.getEnergyCalendar('tempo', { to: 42 }),
        /"to" must be an ISO 8601 date string or a Date/,
      );
      await assert.rejects(gladys.getEnergyCalendar('tempo', { limit: 0 }), /"limit" must be a positive integer/);
      await assert.rejects(gladys.getEnergyCalendar('tempo', { limit: 1.5 }), /"limit" must be a positive integer/);
      assert.equal(server.requests.length, 0);
    });

    it('should throw a GladysApiError on a calendar provided by another integration (403)', async () => {
      server.forceResponse('GET', '/energy/calendar/tempo', 403, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'calendar "tempo" is not provided by this integration',
      });
      await assert.rejects(gladys.getEnergyCalendar('tempo'), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 403);
        return true;
      });
    });
  });

  describe('gladys.getEnergyContracts()', () => {
    it("should GET /energy/contract and resolve with the users' contracts of the integration templates", async () => {
      server.energyContracts = [
        {
          id: 'contract-1',
          template_key: 'octopus-agile',
          template_version: '1',
          pricing_mode: 'delegated',
          inputs: { region: 'A' },
          valid_from: '2026-01-01',
          valid_to: null,
          timezone: 'Europe/London',
          currency: 'GBP',
          billing_period_start_day: 1,
          status: 'active',
        },
      ];
      assert.deepEqual(await gladys.getEnergyContracts(), server.energyContracts);
      assert.equal(server.getRequests('GET', '/energy/contract').length, 1);
    });
  });

  describe('gladys.requestEnergyRecalculation()', () => {
    it('should send an energy-calendar.refresh message with an empty payload, without message_id', async () => {
      await gladys.connect();
      gladys.requestEnergyRecalculation();
      const message = await server.waitForWsMessage(EXTERNAL_INTEGRATION.ENERGY_CALENDAR_REFRESH);
      assert.deepEqual(message, { type: EXTERNAL_INTEGRATION.ENERGY_CALENDAR_REFRESH, payload: {} });
    });

    it('should drop the nudge silently while disconnected', async () => {
      assert.doesNotThrow(() => gladys.requestEnergyRecalculation());
      await gladys.connect();
      server.killConnections();
      await once(gladys, 'disconnected');
      assert.doesNotThrow(() => gladys.requestEnergyRecalculation());
      assert.equal(server.wsMessages.length, 0);
    });
  });

  describe('gladys.onEnergyPrice(callback) — energy-contract.price relay', () => {
    it('should relay the whole request, field for field, and ack the costs in data.costs', async () => {
      const received = [];
      gladys.onEnergyPrice(async (request) => {
        received.push(request);
        return request.intervals.map(({ starts_at: startsAt, kwh }) => ({
          starts_at: startsAt,
          cost: Math.round(kwh * 0.1823 * 1e6) / 1e6,
          components: { energy: kwh * 0.1823 },
          label: 'Agile',
        }));
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_PRICE, {
        message_id: 'ep-1',
        contract: CONTRACT,
        billing_period: BILLING_PERIOD,
        cumulative_before: { day: 3.5, month: 120.2, billing_period: 120.2 },
        intervals: INTERVALS,
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'ep-1',
        success: true,
        data: {
          costs: [
            { starts_at: INTERVALS[0].starts_at, cost: 0.21876, components: { energy: 1.2 * 0.1823 }, label: 'Agile' },
            { starts_at: INTERVALS[1].starts_at, cost: 0.07292, components: { energy: 0.4 * 0.1823 }, label: 'Agile' },
          ],
        },
      });
      assert.deepEqual(received, [
        {
          contract: CONTRACT,
          billing_period: BILLING_PERIOD,
          cumulative_before: { day: 3.5, month: 120.2, billing_period: 120.2 },
          intervals: INTERVALS,
        },
      ]);
      assert.equal('message_id' in received[0], false);
    });

    it('should ack with success:false when the resolved costs are not an array of objects, undefined included', async () => {
      const cases = [undefined, { costs: [] }, [1], ['x'], [null]];
      let index = 0;
      gladys.onEnergyPrice(async () => cases[index]);
      await gladys.connect();
      for (index = 0; index < cases.length; index += 1) {
        server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_PRICE, { message_id: `ep-${index}`, intervals: INTERVALS });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, false, `case ${index}`);
        assert.match(result.payload.error, /resolved costs must be an array of \{ starts_at, cost/);
      }
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onEnergyPrice(async () => {
        throw new Error('provider unavailable');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_PRICE, { message_id: 'ep-9', intervals: INTERVALS });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ep-9', success: false, error: 'provider unavailable' });
    });

    it('should ack with "not implemented" when no handler is registered', async () => {
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_PRICE, { message_id: 'ep-10', intervals: INTERVALS });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ep-10', success: false, error: 'not implemented' });
    });
  });

  describe('gladys.onEnergyCurrent(callback) — energy-contract.current relay', () => {
    it('should relay the request and ack the resolved price object as data', async () => {
      const received = [];
      gladys.onEnergyCurrent(async (request) => {
        received.push(request);
        return { price: 0.1823, valid_until: '2026-01-12T06:00:00Z', next_price: 0.25, label: 'Off-peak' };
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_CURRENT, {
        message_id: 'ec-1',
        contract: CONTRACT,
        billing_period: BILLING_PERIOD,
        cumulative: { day: 3.5, month: 120.2, billing_period: 120.2 },
        max_power_kw: 2.4,
      });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'ec-1',
        success: true,
        data: { price: 0.1823, valid_until: '2026-01-12T06:00:00Z', next_price: 0.25, label: 'Off-peak' },
      });
      assert.deepEqual(received, [
        {
          contract: CONTRACT,
          billing_period: BILLING_PERIOD,
          cumulative: { day: 3.5, month: 120.2, billing_period: 120.2 },
          max_power_kw: 2.4,
        },
      ]);
    });

    it('should serialize a Date valid_until on the wire and accept null prices', async () => {
      gladys.onEnergyCurrent(async () => ({ price: null, valid_until: new Date('2026-01-12T06:00:00.000Z') }));
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_CURRENT, { message_id: 'ec-2', contract: CONTRACT });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, {
        message_id: 'ec-2',
        success: true,
        data: { price: null, valid_until: '2026-01-12T06:00:00.000Z' },
      });
    });

    it('should ack with success:false when the resolved value is not an object, undefined included', async () => {
      const cases = [undefined, 0.18, [0.18], null];
      let index = 0;
      gladys.onEnergyCurrent(async () => cases[index]);
      await gladys.connect();
      for (index = 0; index < cases.length; index += 1) {
        server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_CURRENT, { message_id: `ec-${index}`, contract: CONTRACT });
        const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
        assert.equal(result.payload.success, false, `case ${index}`);
        assert.match(result.payload.error, /resolved value must be an object \{ price/);
      }
    });

    it('should ack with success:false and the error message when the handler throws', async () => {
      gladys.onEnergyCurrent(async () => {
        throw new Error('no price yet');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_CURRENT, { message_id: 'ec-9', contract: CONTRACT });
      const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
      assert.deepEqual(result.payload, { message_id: 'ec-9', success: false, error: 'no price yet' });
    });
  });

  describe('protocol constants', () => {
    it('should expose the energy message types of contract C.4', () => {
      assert.equal(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_PRICE, 'external-integration.energy-contract.price');
      assert.equal(EXTERNAL_INTEGRATION.ENERGY_CONTRACT_CURRENT, 'external-integration.energy-contract.current');
      assert.equal(EXTERNAL_INTEGRATION.ENERGY_CALENDAR_REFRESH, 'external-integration.energy-calendar.refresh');
    });
  });
});
