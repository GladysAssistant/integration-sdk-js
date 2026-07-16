const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { GladysIntegration } = require('../lib');

const createGladys = () => new GladysIntegration({ hostApiUrl: 'http://h', token: 't', selector: 'ext-demo' });

describe('gladys.handleShutdown(cleanup)', () => {
  let savedProcessOnce;
  let savedProcessExit;
  let signalHandlers;
  let exitCodes;

  beforeEach(() => {
    savedProcessOnce = process.once;
    savedProcessExit = process.exit;
    signalHandlers = {};
    exitCodes = [];
    process.once = (event, handler) => {
      signalHandlers[event] = handler;
      return process;
    };
    process.exit = (code) => {
      exitCodes.push(code);
    };
  });

  afterEach(() => {
    process.once = savedProcessOnce;
    process.exit = savedProcessExit;
  });

  it('should register once-handlers for SIGTERM and SIGINT', () => {
    createGladys().handleShutdown();
    assert.deepEqual(Object.keys(signalHandlers).sort(), ['SIGINT', 'SIGTERM']);
  });

  it('should run the cleanup with the signal, disconnect, then exit(0)', async () => {
    const gladys = createGladys();
    const calls = [];
    gladys.disconnect = async () => calls.push('disconnect');
    gladys.handleShutdown(async (signal) => calls.push(`cleanup:${signal}`));
    await signalHandlers.SIGTERM();
    assert.deepEqual(calls, ['cleanup:SIGTERM', 'disconnect']);
    assert.deepEqual(exitCodes, [0]);
  });

  it('should still disconnect and exit(0) when the cleanup throws', async () => {
    const gladys = createGladys();
    const calls = [];
    gladys.disconnect = async () => calls.push('disconnect');
    gladys.handleShutdown(async () => {
      throw new Error('boom');
    });
    await signalHandlers.SIGINT();
    assert.deepEqual(calls, ['disconnect']);
    assert.deepEqual(exitCodes, [0]);
  });

  it('should exit(0) without a cleanup, even when disconnect fails', async () => {
    const gladys = createGladys();
    gladys.disconnect = async () => {
      throw new Error('socket already gone');
    };
    gladys.handleShutdown();
    await signalHandlers.SIGTERM();
    assert.deepEqual(exitCodes, [0]);
  });
});
