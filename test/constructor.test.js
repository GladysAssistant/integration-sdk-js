const { expect } = require('chai');

const { GladysIntegration, GladysApiError, WEBSOCKET_MESSAGE_TYPES } = require('../lib');

const ENV_VARS = ['GLADYS_HOST_API_URL', 'GLADYS_INTEGRATION_TOKEN', 'GLADYS_INTEGRATION_SELECTOR'];

describe('new GladysIntegration()', () => {
  const savedEnv = {};

  beforeEach(() => {
    ENV_VARS.forEach((name) => {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    });
  });

  afterEach(() => {
    ENV_VARS.forEach((name) => {
      if (savedEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    });
  });

  it('should accept explicit options', () => {
    const gladys = new GladysIntegration({
      hostApiUrl: 'http://172.30.0.1:80',
      token: 'my-token',
      selector: 'ext-demo',
    });
    expect(gladys.hostApiUrl).to.equal('http://172.30.0.1:80');
    expect(gladys.token).to.equal('my-token');
    expect(gladys.selector).to.equal('ext-demo');
    expect(gladys.devices).to.deep.equal([]);
    expect(gladys.config).to.deep.equal({});
    expect(gladys.connected).to.equal(false);
  });

  it('should read options from container env vars by default', () => {
    process.env.GLADYS_HOST_API_URL = 'http://172.30.0.1:80';
    process.env.GLADYS_INTEGRATION_TOKEN = 'env-token';
    process.env.GLADYS_INTEGRATION_SELECTOR = 'ext-env';
    const gladys = new GladysIntegration();
    expect(gladys.hostApiUrl).to.equal('http://172.30.0.1:80');
    expect(gladys.token).to.equal('env-token');
    expect(gladys.selector).to.equal('ext-env');
  });

  it('should strip the trailing slash of hostApiUrl and derive the WS URL', () => {
    const gladys = new GladysIntegration({
      hostApiUrl: 'http://172.30.0.1:80/',
      token: 't',
      selector: 's',
    });
    expect(gladys.hostApiUrl).to.equal('http://172.30.0.1:80');
    expect(gladys.wsUrl).to.equal('ws://172.30.0.1:80');
  });

  it('should derive a wss:// URL from an https:// host API URL', () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'https://gladys.local', token: 't', selector: 's' });
    expect(gladys.wsUrl).to.equal('wss://gladys.local');
  });

  it('should throw when hostApiUrl is missing', () => {
    expect(() => new GladysIntegration({ token: 't', selector: 's' })).to.throw(/hostApiUrl/);
  });

  it('should throw when token is missing', () => {
    expect(() => new GladysIntegration({ hostApiUrl: 'http://h', selector: 's' })).to.throw(/token/);
  });

  it('should throw when selector is missing', () => {
    expect(() => new GladysIntegration({ hostApiUrl: 'http://h', token: 't' })).to.throw(/selector/);
  });
});

describe('gladys.externalId(suffix)', () => {
  it('should build a prefixed external id', () => {
    const gladys = new GladysIntegration({ hostApiUrl: 'http://h', token: 't', selector: 'ext-demo' });
    expect(gladys.externalId('switch:binary')).to.equal('ext:ext-demo:switch:binary');
  });
});

describe('module exports', () => {
  it('should expose GladysIntegration, GladysApiError and WEBSOCKET_MESSAGE_TYPES', () => {
    expect(GladysIntegration).to.be.a('function');
    expect(GladysApiError).to.be.a('function');
    expect(WEBSOCKET_MESSAGE_TYPES.EXTERNAL_INTEGRATION.DEVICE_SET_VALUE).to.equal(
      'external-integration.device.set-value',
    );
  });

  it('should expose the same API through the ESM wrapper', async () => {
    // eslint-disable-next-line import/extensions
    const esm = await import('../esm/index.mjs');
    expect(esm.GladysIntegration).to.equal(GladysIntegration);
    expect(esm.GladysApiError).to.equal(GladysApiError);
    expect(esm.WEBSOCKET_MESSAGE_TYPES).to.equal(WEBSOCKET_MESSAGE_TYPES);
    expect(esm.default.GladysIntegration).to.equal(GladysIntegration);
  });
});
