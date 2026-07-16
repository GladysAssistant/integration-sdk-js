const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { createLogger, logger } = require('../lib/logger');

const PREFIX_REGEX = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[([A-Z]+)\](?: \[(.+)\])?$/;

describe('logger', () => {
  let savedLogLevel;
  let savedConsoleLog;
  let savedConsoleError;
  let stdout;
  let stderr;

  beforeEach(() => {
    savedLogLevel = process.env.LOG_LEVEL;
    savedConsoleLog = console.log;
    savedConsoleError = console.error;
    delete process.env.LOG_LEVEL;
    stdout = [];
    stderr = [];
    console.log = (...args) => stdout.push(args);
    console.error = (...args) => stderr.push(args);
  });

  afterEach(() => {
    console.log = savedConsoleLog;
    console.error = savedConsoleError;
    if (savedLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = savedLogLevel;
    }
  });

  it('should default to the info level', () => {
    logger.debug('hidden');
    logger.info('visible');
    assert.equal(stdout.length, 1);
    assert.deepEqual(stdout[0].slice(1), ['visible']);
  });

  it('should prefix lines with a timestamp and the level', () => {
    logger.info('hello', 42);
    const [prefix, ...rest] = stdout[0];
    const match = prefix.match(PREFIX_REGEX);
    assert.ok(match, `unexpected prefix: ${prefix}`);
    assert.equal(match[1], 'INFO');
    assert.deepEqual(rest, ['hello', 42]);
  });

  it('should send debug/info to stdout and warn/error to stderr', () => {
    process.env.LOG_LEVEL = 'debug';
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    assert.deepEqual(
      stdout.map((args) => args[1]),
      ['d', 'i'],
    );
    assert.deepEqual(
      stderr.map((args) => args[1]),
      ['w', 'e'],
    );
  });

  it('should honour LOG_LEVEL, re-read on every call', () => {
    process.env.LOG_LEVEL = 'error';
    logger.warn('hidden');
    process.env.LOG_LEVEL = 'warn';
    logger.warn('visible');
    assert.equal(stderr.length, 1);
    assert.deepEqual(stderr[0].slice(1), ['visible']);
  });

  it('should log nothing when LOG_LEVEL=silent', () => {
    process.env.LOG_LEVEL = 'silent';
    logger.error('hidden');
    assert.deepEqual(stderr, []);
  });

  it('should read LOG_LEVEL case-insensitively', () => {
    process.env.LOG_LEVEL = 'DEBUG';
    logger.debug('visible');
    assert.equal(stdout.length, 1);
  });

  it('should fall back to info for an unknown LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'verbose';
    logger.debug('hidden');
    logger.info('visible');
    assert.equal(stdout.length, 1);
  });

  it('should let the level option pin the level over LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'error';
    const pinned = createLogger({ level: 'debug' });
    pinned.debug('visible');
    assert.equal(stdout.length, 1);
  });

  it('should throw for an unknown level option', () => {
    assert.throws(() => createLogger({ level: 'verbose' }), /unknown level "verbose"/);
  });

  it('should include the name in the prefix', () => {
    const named = createLogger({ name: 'weather-station' });
    named.info('hello');
    const match = stdout[0][0].match(PREFIX_REGEX);
    assert.ok(match);
    assert.equal(match[2], 'weather-station');
  });

  it('should nest names through child()', () => {
    const child = createLogger({ name: 'devices' }).child('plug');
    child.info('hello');
    const match = stdout[0][0].match(PREFIX_REGEX);
    assert.ok(match);
    assert.equal(match[2], 'devices:plug');
  });

  it('should keep the pinned level in child()', () => {
    const child = createLogger({ level: 'silent' }).child('plug');
    child.error('hidden');
    assert.deepEqual(stderr, []);
  });
});
