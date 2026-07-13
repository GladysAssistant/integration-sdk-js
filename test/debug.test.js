/* eslint-disable no-console */
const { expect } = require('chai');

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
    expect(logged).to.deep.equal([]);
  });

  it('should log on stderr when DEBUG=gladys-integration-sdk', () => {
    process.env.DEBUG = NAMESPACE;
    debug('visible message', 42);
    expect(logged).to.deep.equal([[`[${NAMESPACE}]`, 'visible message', 42]]);
  });

  it('should log when DEBUG contains the namespace among others', () => {
    process.env.DEBUG = `other,${NAMESPACE}:*`;
    debug('also visible');
    expect(logged).to.have.lengthOf(1);
  });

  it('should log when DEBUG=*', () => {
    process.env.DEBUG = '*';
    debug('wildcard');
    expect(logged).to.have.lengthOf(1);
  });

  it('should not log for an unrelated DEBUG namespace', () => {
    process.env.DEBUG = 'express:*';
    debug('hidden');
    expect(logged).to.deep.equal([]);
  });
});
