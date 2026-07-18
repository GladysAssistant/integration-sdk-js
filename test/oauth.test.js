const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { WEBSOCKET_MESSAGE_TYPES } = require('../lib');
const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

const { EXTERNAL_INTEGRATION } = WEBSOCKET_MESSAGE_TYPES;

describe('OAuth2 relay (oauth.get-authorize-url / oauth.callback)', () => {
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

  it('should ack oauth.get-authorize-url with the resolved URL in data.authorize_url', async () => {
    const received = [];
    gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => {
      received.push([key, redirectUri]);
      return 'https://provider.example/authorize?client_id=abc&state=xyz';
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL, {
      message_id: 'msg-1',
      key: 'netatmo_account',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, {
      message_id: 'msg-1',
      success: true,
      data: { authorize_url: 'https://provider.example/authorize?client_id=abc&state=xyz' },
    });
    assert.deepEqual(received, [['netatmo_account', 'https://gladys.local/oauth-callback']]);
  });

  it('should ack oauth.get-authorize-url with success:false when the handler throws', async () => {
    gladys.onOAuthAuthorizeUrl(async () => {
      throw new Error('client_id not configured');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL, {
      message_id: 'msg-2',
      key: 'netatmo_account',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-2', success: false, error: 'client_id not configured' });
  });

  it('should ack oauth.get-authorize-url with "not implemented" when no handler is registered', async () => {
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL, {
      message_id: 'msg-3',
      key: 'netatmo_account',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-3', success: false, error: 'not implemented' });
  });

  it('should ack oauth.callback with success:true after the handler resolves', async () => {
    const received = [];
    gladys.onOAuthCallback(async (key, params) => {
      received.push([key, params]);
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.OAUTH_CALLBACK, {
      message_id: 'msg-4',
      key: 'netatmo_account',
      code: 'auth-code',
      state: 'xyz',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-4', success: true });
    assert.deepEqual(received, [
      ['netatmo_account', { code: 'auth-code', state: 'xyz', redirectUri: 'https://gladys.local/oauth-callback' }],
    ]);
  });

  it('should ack oauth.callback with success:false and the error message when the handler throws', async () => {
    gladys.onOAuthCallback(async () => {
      throw new Error('state mismatch');
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.OAUTH_CALLBACK, {
      message_id: 'msg-5',
      key: 'netatmo_account',
      code: 'auth-code',
      state: 'forged',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const result = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(result.payload, { message_id: 'msg-5', success: false, error: 'state mismatch' });
  });

  it('should support the full Netatmo-style flow: authorize, callback, tokens stored, status published', async () => {
    server.config = { client_id: 'abc', client_secret: 's3cr3t' };
    gladys.onOAuthAuthorizeUrl(
      async (key, redirectUri) =>
        `https://provider.example/authorize?client_id=${gladys.config.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&state=xyz`,
    );
    gladys.onOAuthCallback(async (key, { code, state }) => {
      if (state !== 'xyz') {
        throw new Error('state mismatch');
      }
      await gladys.setConfig({ access_token: `token-for-${code}`, refresh_token: 'refresh' });
      await gladys.setConnectionStatus(true);
    });
    await gladys.connect();
    server.send(EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL, {
      message_id: 'msg-6',
      key: 'netatmo_account',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const authorizeResult = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.equal(authorizeResult.payload.success, true);
    assert.match(authorizeResult.payload.data.authorize_url, /^https:\/\/provider\.example\/authorize\?client_id=abc/);
    server.send(EXTERNAL_INTEGRATION.OAUTH_CALLBACK, {
      message_id: 'msg-7',
      key: 'netatmo_account',
      code: 'auth-code',
      state: 'xyz',
      redirect_uri: 'https://gladys.local/oauth-callback',
    });
    const callbackResult = await server.waitForWsMessage(EXTERNAL_INTEGRATION.COMMAND_RESULT);
    assert.deepEqual(callbackResult.payload, { message_id: 'msg-7', success: true });
    // Tokens stored as config keys outside the schema, never through the front.
    assert.equal(server.config.access_token, 'token-for-auth-code');
    // Application connection status published.
    assert.deepEqual(server.getRequests('POST', '/connection_status')[0].body, { connected: true });
  });
});
