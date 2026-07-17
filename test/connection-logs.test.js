const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { describeError } = require('../lib/errors');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient, once } = require('./helpers/create-client');

/**
 * Build a logger that records every line instead of writing to the console,
 * so tests can assert what the SDK logs.
 */
const createRecordingLogger = () => {
  const lines = [];
  const record =
    (level) =>
    (...args) =>
      lines.push({ level, message: args.join(' ') });
  const logger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: () => logger,
  };
  const find = (level, pattern) => lines.find((line) => line.level === level && pattern.test(line.message));
  return { logger, lines, find };
};

describe('connection logs', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
  });

  afterEach(async () => {
    if (gladys) {
      await gladys.disconnect();
    }
    await server.stop();
  });

  it('should use a named default logger when none is provided', () => {
    gladys = createClient(server, { logger: undefined });
    assert.equal(typeof gladys.logger.info, 'function');
    assert.equal(typeof gladys.logger.warn, 'function');
    assert.equal(typeof gladys.logger.error, 'function');
  });

  it('should log an info line on every successful (re)connection, and nothing above', async () => {
    const logs = createRecordingLogger();
    gladys = createClient(server, { logger: logs.logger });
    await gladys.connect();
    assert.ok(logs.find('info', /connected to Gladys/));
    assert.equal(logs.lines.filter((line) => line.level === 'warn' || line.level === 'error').length, 0);
  });

  it('should log the websocket error and the retry when Gladys is unreachable', async () => {
    const { port } = server;
    await server.stop();
    const logs = createRecordingLogger();
    gladys = createClient(server, { hostApiUrl: `http://127.0.0.1:${port}`, logger: logs.logger });
    gladys.connect();
    await delay(50);
    assert.ok(logs.find('error', /websocket error on ws:\/\/127\.0\.0\.1/));
    assert.ok(logs.find('error', /ECONNREFUSED/));
    assert.ok(logs.find('warn', /not connected to Gladys .* retrying in \d+ ms \(attempt \d+\)/));
    // Restart the server so the pending connect() resolves and the teardown stays clean.
    server = new FakeGladysServer();
    await server.start(port);
    await once(gladys, 'connected');
  });

  it('should log an explicit error when Gladys refuses the token', async () => {
    const logs = createRecordingLogger();
    gladys = createClient(server, { token: 'wrong-token', logger: logs.logger });
    await assert.rejects(gladys.connect(), /authentication refused/);
    assert.ok(logs.find('error', /authentication refused by Gladys \(close code 4000\)/));
    assert.ok(logs.find('error', /GLADYS_INTEGRATION_TOKEN/));
  });

  it('should log an error when the resynchronization fails after authentication', async () => {
    server.forceResponse('GET', '/device', 500, { status: 500, code: 'SERVER_ERROR', message: 'boom' });
    const logs = createRecordingLogger();
    gladys = createClient(server, { logger: logs.logger });
    const connectPromise = gladys.connect();
    await delay(50);
    assert.ok(logs.find('error', /resynchronization failed: boom/));
    server.forcedResponses.clear();
    await connectPromise;
  });

  it('should log a warning when an established connection drops, then an info once reconnected', async () => {
    const logs = createRecordingLogger();
    gladys = createClient(server, { logger: logs.logger });
    await gladys.connect();
    server.killConnections();
    await once(gladys, 'connected');
    assert.ok(logs.find('warn', /connection to Gladys lost \(close code \d+\)/));
    assert.equal(
      logs.lines.filter((line) => line.level === 'info' && /connected to Gladys/.test(line.message)).length,
      2,
    );
  });

  it('should not log any warning or error on a clean disconnect()', async () => {
    const logs = createRecordingLogger();
    gladys = createClient(server, { logger: logs.logger });
    await gladys.connect();
    await gladys.disconnect();
    await delay(50);
    assert.equal(logs.lines.filter((line) => line.level === 'warn' || line.level === 'error').length, 0);
  });
});

describe('describeError(error)', () => {
  it('should append the error code when the message does not carry it', () => {
    const error = new Error('fetch failed');
    error.cause = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    assert.equal(describeError(error), 'fetch failed (ECONNREFUSED)');
  });

  it('should not repeat a code already present in the message', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:80'), { code: 'ECONNREFUSED' });
    assert.equal(describeError(error), 'connect ECONNREFUSED 127.0.0.1:80');
  });

  it('should fall back to the cause message, then to a generic label', () => {
    const error = new Error('fetch failed');
    error.cause = new Error('socket hang up');
    assert.equal(describeError(error), 'fetch failed (socket hang up)');
    assert.equal(describeError(undefined), 'unknown error');
    assert.equal(describeError('boom'), 'boom');
  });
});
