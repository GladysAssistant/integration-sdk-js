const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, deferred } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

const ACCOUNTS = [
  { user: { selector: 'john', first_name: 'John', language: 'en' }, config: { server_url: 'https://cal.example' } },
];
const CALENDARS = [
  {
    user: 'john',
    external_id: 'ext:ext-demo:john:primary',
    selector: 'personal',
    name: 'Personal',
    description: '',
    color: '#3174ad',
    sync: true,
    shared: false,
  },
  {
    user: 'jane',
    external_id: 'ext:ext-demo:jane:primary',
    selector: 'personal-2',
    name: 'Personal',
    description: '',
    color: '#3174ad',
    sync: false,
    shared: true,
  },
];

describe('calendar integrations (manifest type "calendar")', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    server.calendarAccounts = ACCOUNTS;
    server.calendars = CALENDARS;
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  describe('gladys.getCalendarAccounts()', () => {
    it('should GET /calendar/account and resolve with the enabled users and their account values', async () => {
      const accounts = await gladys.getCalendarAccounts();
      assert.deepEqual(accounts, ACCOUNTS);
      const requests = server.getRequests('GET', '/calendar/account');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].authorization, `Bearer ${server.token}`);
    });

    it('should throw a GladysApiError on a non-calendar integration (403)', async () => {
      server.forceResponse('GET', '/calendar/account', 403, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'CALENDAR_NOT_ALLOWED',
      });
      await assert.rejects(gladys.getCalendarAccounts(), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 403);
        return true;
      });
    });
  });

  describe('gladys.getCalendars(userSelector?)', () => {
    it("should GET /calendar without a filter and resolve with every user's calendars", async () => {
      assert.deepEqual(await gladys.getCalendars(), CALENDARS);
      const [request] = server.getRequests('GET', '/calendar');
      assert.deepEqual(request.query, {});
    });

    it('should GET /calendar?user=<selector> for one user, url-encoded', async () => {
      assert.deepEqual(await gladys.getCalendars('john'), [CALENDARS[0]]);
      const [request] = server.getRequests('GET', '/calendar');
      assert.deepEqual(request.query, { user: 'john' });
      await gladys.getCalendars('a b&c');
      assert.deepEqual(server.getRequests('GET', '/calendar')[1].query, { user: 'a b&c' });
    });

    it('should reject an invalid user selector before any request', async () => {
      await assert.rejects(gladys.getCalendars(''), /"userSelector" must be a non-empty string/);
      await assert.rejects(gladys.getCalendars(42), /"userSelector" must be a non-empty string/);
      assert.equal(server.getRequests('GET', '/calendar').length, 0);
    });
  });

  describe('gladys.publishCalendars(userSelector, calendars)', () => {
    it('should POST /calendar with the user and the whitelisted calendar fields', async () => {
      const result = await gladys.publishCalendars('john', [
        {
          external_id: gladys.externalId('john:primary'),
          name: 'Personal',
          description: 'Family stuff',
          color: '#3174AD',
          extra: 'dropped',
        },
        { external_id: gladys.externalId('john:work'), name: 'Work', description: null, color: null },
      ]);
      assert.deepEqual(result, { success: true, created: 2, updated: 0 });
      const [request] = server.getRequests('POST', '/calendar');
      assert.deepEqual(request.body, {
        user: 'john',
        calendars: [
          { external_id: 'ext:ext-demo:john:primary', name: 'Personal', description: 'Family stuff', color: '#3174AD' },
          { external_id: 'ext:ext-demo:john:work', name: 'Work' },
        ],
      });
    });

    it('should reject an invalid user or list before any request', async () => {
      await assert.rejects(gladys.publishCalendars('', []), /"userSelector" must be a non-empty string/);
      await assert.rejects(gladys.publishCalendars('john', {}), /"calendars" must be an array/);
      await assert.rejects(
        gladys.publishCalendars(
          'john',
          Array.from({ length: 51 }, (_, i) => ({ external_id: gladys.externalId(`john:${i}`), name: `C${i}` })),
        ),
        /maximum 50 calendars per user/,
      );
      await assert.rejects(gladys.publishCalendars('john', [null]), /"calendars\[0\]" must be an object/);
      assert.equal(server.getRequests('POST', '/calendar').length, 0);
    });

    it('should enforce the user-scoped external_id prefix, its bound and its uniqueness', async () => {
      const prefixError = /"calendars\[0\]\.external_id" must start with "ext:ext-demo:john:"/;
      await assert.rejects(gladys.publishCalendars('john', [{ external_id: 'primary', name: 'P' }]), prefixError);
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: gladys.externalId('jane:primary'), name: 'P' }]),
        prefixError,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: gladys.externalId('john:'), name: 'P' }]),
        prefixError,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: gladys.externalId(`john:${'x'.repeat(250)}`), name: 'P' }]),
        prefixError,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [
          { external_id: gladys.externalId('john:primary'), name: 'P' },
          { external_id: gladys.externalId('john:primary'), name: 'Q' },
        ]),
        /"calendars\[1\]\.external_id" is a duplicate in the batch/,
      );
      assert.equal(server.getRequests('POST', '/calendar').length, 0);
    });

    it('should enforce the name, description and color shapes', async () => {
      const id = gladys.externalId('john:primary');
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: id, name: '' }]),
        /"calendars\[0\]\.name" must be a string of 1-100 characters/,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: id, name: 'x'.repeat(101) }]),
        /"calendars\[0\]\.name" must be a string of 1-100 characters/,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: id, name: 'P', description: 'x'.repeat(501) }]),
        /"calendars\[0\]\.description" must be a string of at most 500 characters/,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: id, name: 'P', description: 42 }]),
        /"calendars\[0\]\.description" must be a string/,
      );
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: id, name: 'P', color: 0x3174ad }]),
        /"calendars\[0\]\.color" must be a string like "#3174ad"/,
      );
      assert.equal(server.getRequests('POST', '/calendar').length, 0);
    });

    it('should throw a GladysApiError on a user who did not enable the integration (404)', async () => {
      server.forceResponse('POST', '/calendar', 404, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'CALENDAR_ACCOUNT_NOT_FOUND',
      });
      await assert.rejects(
        gladys.publishCalendars('bob', [{ external_id: gladys.externalId('bob:primary'), name: 'P' }]),
        (error) => {
          assert.ok(error instanceof GladysApiError);
          assert.equal(error.status, 404);
          return true;
        },
      );
    });

    it('should throw a GladysApiError past the calendar write rate limit (429)', async () => {
      server.forceResponse('POST', '/calendar', 429, {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'RATE_LIMIT_EXCEEDED: max 30 calendar writes per minute',
      });
      await assert.rejects(
        gladys.publishCalendars('john', [{ external_id: gladys.externalId('john:primary'), name: 'P' }]),
        (error) => {
          assert.ok(error instanceof GladysApiError);
          assert.equal(error.status, 429);
          return true;
        },
      );
    });
  });

  describe('gladys.deleteCalendar(externalId)', () => {
    it('should DELETE /calendar?external_id=<id>, url-encoded', async () => {
      const result = await gladys.deleteCalendar(gladys.externalId('john:primary'));
      assert.deepEqual(result, { success: true });
      const [request] = server.getRequests('DELETE', '/calendar');
      assert.deepEqual(request.query, { external_id: 'ext:ext-demo:john:primary' });
      assert.equal(request.authorization, `Bearer ${server.token}`);
      assert.equal(request.body, undefined);
    });

    it('should reject an invalid external_id before any request', async () => {
      await assert.rejects(gladys.deleteCalendar(''), /"externalId" must be a non-empty string/);
      await assert.rejects(gladys.deleteCalendar(undefined), /"externalId" must be a non-empty string/);
      assert.equal(server.getRequests('DELETE', '/calendar').length, 0);
    });

    it("should throw a GladysApiError on another integration's calendar (404)", async () => {
      server.forceResponse('DELETE', '/calendar', 404, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'CALENDAR_NOT_FOUND',
      });
      await assert.rejects(gladys.deleteCalendar('ext:other:john:primary'), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 404);
        return true;
      });
    });
  });

  describe('gladys.publishCalendarEvents(calendarExternalId, events, window?)', () => {
    const calendarId = 'ext:ext-demo:john:primary';

    it('should POST /calendar/event with the whitelisted events, dates serialized, and the window', async () => {
      const result = await gladys.publishCalendarEvents(
        calendarId,
        [
          {
            external_id: gladys.externalId('john:8f3a@google.com'),
            name: 'Dentist',
            start: new Date('2026-08-14T09:00:00.000Z'),
            end: '2026-08-14T09:30:00.000Z',
            location: '12 rue des Lilas, Paris',
            description: 'Bring the card',
            url: 'https://calendar.google.com/event?eid=abc',
            extra: 'dropped',
          },
          {
            external_id: gladys.externalId('john:holiday-20260815'),
            name: 'Assomption',
            start: '2026-08-15',
            end: '2026-08-16',
            full_day: true,
            location: null,
            description: null,
            url: null,
          },
          {
            external_id: gladys.externalId('john:zero'),
            name: 'Zero duration',
            start: '2026-08-20T10:00:00Z',
            end: null,
          },
        ],
        { from: '2026-08-01T00:00:00.000Z', to: new Date('2026-09-01T00:00:00.000Z') },
      );
      assert.deepEqual(result, { success: true, created: 3, updated: 0, deleted: 0 });
      const [request] = server.getRequests('POST', '/calendar/event');
      assert.deepEqual(request.body, {
        calendar_external_id: calendarId,
        window: { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
        events: [
          {
            external_id: 'ext:ext-demo:john:8f3a@google.com',
            name: 'Dentist',
            start: '2026-08-14T09:00:00.000Z',
            end: '2026-08-14T09:30:00.000Z',
            location: '12 rue des Lilas, Paris',
            description: 'Bring the card',
            url: 'https://calendar.google.com/event?eid=abc',
          },
          {
            external_id: 'ext:ext-demo:john:holiday-20260815',
            name: 'Assomption',
            start: '2026-08-15',
            end: '2026-08-16',
            full_day: true,
          },
          { external_id: 'ext:ext-demo:john:zero', name: 'Zero duration', start: '2026-08-20T10:00:00Z' },
        ],
      });
    });

    it('should send no window when none is given (pure upsert)', async () => {
      await gladys.publishCalendarEvents(calendarId, []);
      const [request] = server.getRequests('POST', '/calendar/event');
      assert.deepEqual(request.body, { calendar_external_id: calendarId, events: [] });
    });

    it('should reject a calendar external_id that is not user-scoped to the integration', async () => {
      const error = /"calendarExternalId" must be a calendar external_id of the integration/;
      await assert.rejects(gladys.publishCalendarEvents('primary', []), error);
      await assert.rejects(gladys.publishCalendarEvents(undefined, []), error);
      await assert.rejects(gladys.publishCalendarEvents('ext:other:john:primary', []), error);
      await assert.rejects(gladys.publishCalendarEvents('ext:ext-demo:john', []), error);
      await assert.rejects(gladys.publishCalendarEvents('ext:ext-demo:john:', []), error);
      await assert.rejects(gladys.publishCalendarEvents('ext:ext-demo::primary', []), error);
      assert.equal(server.getRequests('POST', '/calendar/event').length, 0);
    });

    it('should reject an invalid list or window before any request', async () => {
      await assert.rejects(gladys.publishCalendarEvents(calendarId, {}), /"events" must be an array/);
      const tooMany = Array.from({ length: 501 }, (_, i) => ({
        external_id: gladys.externalId(`john:${i}`),
        name: 'E',
        start: '2026-08-14T09:00:00Z',
      }));
      await assert.rejects(gladys.publishCalendarEvents(calendarId, tooMany), /maximum 500 events per request/);
      await assert.rejects(gladys.publishCalendarEvents(calendarId, [], null), /"window" must be an object/);
      await assert.rejects(gladys.publishCalendarEvents(calendarId, [], 'x'), /"window" must be an object/);
      await assert.rejects(
        gladys.publishCalendarEvents(calendarId, [], { from: 'yesterday', to: '2026-09-01' }),
        /"window.from" must be an ISO 8601 date string or a Date/,
      );
      await assert.rejects(
        gladys.publishCalendarEvents(calendarId, [], { from: '2026-08-01', to: new Date('nope') }),
        /"window.to" must be a valid Date/,
      );
      await assert.rejects(
        gladys.publishCalendarEvents(calendarId, [], { from: '2026-09-01', to: '2026-08-01' }),
        /"window.from" must be before "window.to"/,
      );
      await assert.rejects(
        gladys.publishCalendarEvents(calendarId, [], { from: '2026-08-01', to: '2026-08-01' }),
        /"window.from" must be before "window.to"/,
      );
      assert.equal(server.getRequests('POST', '/calendar/event').length, 0);
    });

    it('should enforce the event external_id prefix of the calendar user and the event shape', async () => {
      const event = (overrides) => ({
        external_id: gladys.externalId('john:uid'),
        name: 'Dentist',
        start: '2026-08-14T09:00:00Z',
        ...overrides,
      });
      const publish = (overrides) => gladys.publishCalendarEvents(calendarId, [event(overrides)]);
      await assert.rejects(gladys.publishCalendarEvents(calendarId, ['x']), /"events\[0\]" must be an object/);
      await assert.rejects(
        publish({ external_id: gladys.externalId('jane:uid') }),
        /"events\[0\]\.external_id" must start with "ext:ext-demo:john:"/,
      );
      await assert.rejects(
        gladys.publishCalendarEvents(calendarId, [event({}), event({ name: 'Twice' })]),
        /"events\[1\]\.external_id" is a duplicate in the batch/,
      );
      await assert.rejects(publish({ name: '' }), /"events\[0\]\.name" must be a string of 1-200 characters/);
      await assert.rejects(
        publish({ name: 'x'.repeat(201) }),
        /"events\[0\]\.name" must be a string of 1-200 characters/,
      );
      await assert.rejects(publish({ full_day: 'yes' }), /"events\[0\]\.full_day" must be a boolean/);
      await assert.rejects(publish({ start: undefined }), /"events\[0\]\.start" must be an ISO 8601 date string/);
      await assert.rejects(publish({ start: 'tomorrow' }), /"events\[0\]\.start" must be an ISO 8601 date string/);
      await assert.rejects(publish({ end: 'never' }), /"events\[0\]\.end" must be an ISO 8601 date string/);
      await assert.rejects(publish({ end: '2026-08-14T08:00:00Z' }), /"events\[0\]\.end" must not be before "start"/);
      await assert.rejects(
        publish({ location: 'x'.repeat(501) }),
        /"events\[0\]\.location" must be a string of at most 500 characters/,
      );
      await assert.rejects(
        publish({ description: 'x'.repeat(1001) }),
        /"events\[0\]\.description" must be a string of at most 1000 characters/,
      );
      await assert.rejects(publish({ url: 'ftp://x' }), /"events\[0\]\.url" must be an http\(s\) URL/);
      await assert.rejects(
        publish({ url: `https://${'x'.repeat(500)}` }),
        /"events\[0\]\.url" must be an http\(s\) URL/,
      );
      await assert.rejects(publish({ url: 42 }), /"events\[0\]\.url" must be an http\(s\) URL/);
      assert.equal(server.getRequests('POST', '/calendar/event').length, 0);
    });

    it('should require calendar dates on a full-day event (what the provider wrote), accepting ISO datetimes', async () => {
      const fullDay = (start, end) =>
        gladys.publishCalendarEvents(calendarId, [
          { external_id: gladys.externalId('john:day'), name: 'Day', start, end, full_day: true },
        ]);
      await assert.rejects(
        fullDay('2026/08/15'),
        /"events\[0\]\.start" must be a calendar date \(YYYY-MM-DD\) on a full-day event/,
      );
      await assert.rejects(
        fullDay('2026-08-15', 'Aug 16 2026'),
        /"events\[0\]\.end" must be a calendar date \(YYYY-MM-DD\) on a full-day event/,
      );
      // A date that does not exist rolls over in JavaScript (Date.parse accepts
      // "2026-02-30" as March 2): refused like the core does, not forwarded.
      for (const date of ['2026-02-30', '2026-04-31', '2026-02-29']) {
        await assert.rejects(
          fullDay(date),
          /"events\[0\]\.start" must be a calendar date \(YYYY-MM-DD\) on a full-day event/,
          date,
        );
        await assert.rejects(
          fullDay('2026-08-15', `${date}T00:00:00Z`),
          /"events\[0\]\.end" must be a calendar date \(YYYY-MM-DD\) on a full-day event/,
          date,
        );
      }
      await fullDay('2026-08-15');
      await fullDay('2026-08-15T00:00:00+02:00', '2026-08-16T00:00:00+02:00');
      await fullDay(new Date('2026-08-15T12:00:00Z'));
      await fullDay('2024-02-29', '2024-03-01');
      const bodies = server.getRequests('POST', '/calendar/event').map((request) => request.body.events[0]);
      assert.deepEqual(
        bodies.map((event) => [event.start, event.end]),
        [
          ['2026-08-15', undefined],
          ['2026-08-15T00:00:00+02:00', '2026-08-16T00:00:00+02:00'],
          ['2026-08-15T12:00:00.000Z', undefined],
          ['2024-02-29', '2024-03-01'],
        ],
      );
    });

    it('should order the dates of a full-day event by calendar date, never by instant', async () => {
      const fullDay = (start, end) =>
        gladys.publishCalendarEvents(calendarId, [
          { external_id: gladys.externalId('john:day'), name: 'Day', start, end, full_day: true },
        ]);
      // The instants are reversed (08-16T04:00Z, then 08-15T15:00Z), the calendar dates are not.
      await fullDay('2026-08-15T23:00:00-05:00', '2026-08-16T00:00:00+09:00');
      // Same day: the core covers the start day.
      await fullDay('2026-08-15', '2026-08-15');
      // The instants are ordered (08-15T15:00Z, then 08-16T04:00Z), the calendar dates are reversed.
      await assert.rejects(
        fullDay('2026-08-16T00:00:00+09:00', '2026-08-15T23:00:00-05:00'),
        /"events\[0\]\.end" must not be before "start"/,
      );
      await assert.rejects(fullDay('2026-08-16', '2026-08-15'), /"events\[0\]\.end" must not be before "start"/);
      assert.equal(server.getRequests('POST', '/calendar/event').length, 2);
    });

    it('should throw a GladysApiError on a sync-disabled calendar (403) and an unknown one (404)', async () => {
      server.forceResponse('POST', '/calendar/event', 403, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'CALENDAR_SYNC_DISABLED',
      });
      await assert.rejects(gladys.publishCalendarEvents(calendarId, []), (error) => {
        assert.ok(error instanceof GladysApiError);
        assert.equal(error.status, 403);
        assert.equal(error.message, 'CALENDAR_SYNC_DISABLED');
        return true;
      });
      server.forceResponse('POST', '/calendar/event', 404, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'CALENDAR_NOT_FOUND',
      });
      await assert.rejects(gladys.publishCalendarEvents(calendarId, []), (error) => {
        assert.equal(error.status, 404);
        return true;
      });
    });
  });

  describe('gladys.onCalendarAccountUpdated(callback) — calendar.account-updated event', () => {
    it('should call the handler with the user selector, without ack', async () => {
      const received = deferred();
      gladys.onCalendarAccountUpdated(async (userSelector) => received.resolve(userSelector));
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.CALENDAR_ACCOUNT_UPDATED, { user: 'john' });
      assert.equal(await received.promise, 'john');
      // No message_id, no command-result: the config-updated family.
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      assert.equal(server.wsMessages.filter((m) => m.type === EXTERNAL_INTEGRATION.COMMAND_RESULT).length, 0);
    });

    it('should swallow a handler error (events have no ack) and ignore the event without handler', async () => {
      const calls = [];
      gladys.onCalendarAccountUpdated(async (userSelector) => {
        calls.push(userSelector);
        throw new Error('resync failed');
      });
      await gladys.connect();
      server.send(EXTERNAL_INTEGRATION.CALENDAR_ACCOUNT_UPDATED, { user: 'jane' });
      server.send(EXTERNAL_INTEGRATION.HEARTBEAT, {});
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      assert.deepEqual(calls, ['jane']);
      assert.equal(gladys.connected, true);
    });
  });

  describe('protocol constants', () => {
    it('should expose the calendar message type of contract C.4', () => {
      assert.equal(EXTERNAL_INTEGRATION.CALENDAR_ACCOUNT_UPDATED, 'external-integration.calendar.account-updated');
    });
  });
});
