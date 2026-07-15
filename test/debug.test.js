const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { debug, NAMESPACE } = require('../lib/debug');

describe('debug logging', () => {
  let savedDebug;
  let savedConsoleError;
  let logged;

  beforeEach(() => {
    savedDebug = process.env.DEBUG;
    savedConsoleError = console.error;
    logged = [];
    console.error = (...args) => logged.push(args);
  });

  afterEach(() => {
    console.error = savedConsoleError;
    if (savedDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = savedDebug;
    }
  });

  it('should not log anything by default (stdout/stderr belong to the integration)', () => {
    delete process.env.DEBUG;
    debug('hidden message');
    assert.deepEqual(logged, []);
  });

  it('should log on stderr when DEBUG=gladys-integration-sdk', () => {
    process.env.DEBUG = NAMESPACE;
    debug('visible message', 42);
    assert.deepEqual(logged, [[`[${NAMESPACE}]`, 'visible message', 42]]);
  });

  it('should log when DEBUG contains the namespace among others', () => {
    process.env.DEBUG = `other,${NAMESPACE}:*`;
    debug('also visible');
    assert.equal(logged.length, 1);
  });

  it('should log when DEBUG=*', () => {
    process.env.DEBUG = '*';
    debug('wildcard');
    assert.equal(logged.length, 1);
  });

  it('should not log for an unrelated DEBUG namespace', () => {
    process.env.DEBUG = 'express:*';
    debug('hidden');
    assert.deepEqual(logged, []);
  });
});
