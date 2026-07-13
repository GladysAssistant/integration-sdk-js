# @gladysassistant/integration-sdk

Official Node.js SDK to build **external integrations** for [Gladys Assistant](https://gladysassistant.com).

An external integration is a program running in an isolated Docker container, supervised by Gladys. It talks to
Gladys through the host API (REST) and an outgoing WebSocket — this SDK wraps both, so an integration usually fits in
a few dozen lines.

- Node.js >= 20, a single runtime dependency ([`ws`](https://github.com/websockets/ws))
- CommonJS + ESM, TypeScript typings included
- Automatic reconnection with exponential backoff, automatic state resynchronization, automatic command acks

## Getting started

The fastest way to start is the official template repository:
[`GladysAssistant/integration-template-js`](https://github.com/GladysAssistant/integration-template-js)
("Use this template" → edit the manifest → tag your repo with the `gladys-assistant-integration` topic → your
integration appears in the store of every Gladys). The complete developer documentation (manifest reference, host
API, container contract, publication guide) lives on
[gladysassistant.com](https://gladysassistant.com/docs).

## Install

```bash
npm install @gladysassistant/integration-sdk
```

## Usage

```js
const { GladysIntegration } = require('@gladysassistant/integration-sdk');

// Every option is read from the container env vars by default
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR);
// override them for development outside Docker.
const gladys = new GladysIntegration();

gladys.onScanRequest(async () => {
  await gladys.publishDiscoveredDevices([
    {
      name: 'Virtual switch',
      external_id: gladys.externalId('switch'),
      features: [
        {
          name: 'On/Off',
          external_id: gladys.externalId('switch:binary'),
          category: 'switch',
          type: 'binary',
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
          keep_history: true,
        },
      ],
    },
  ]);
});

gladys.onSetValue(async (device, feature, value) => {
  // resolving acks the command with success; throwing acks it as failed
  await gladys.publishState(feature.external_id, value);
});

gladys.onConfigUpdated(async (config) => {
  console.log('New config', config); // stdout → docker logs
});

await gladys.connect(); // resolves once authenticated
```

## API

### `new GladysIntegration(options?)`

| Option       | Default                               | Description                     |
| ------------ | ------------------------------------- | ------------------------------- |
| `hostApiUrl` | `GLADYS_HOST_API_URL` env var         | Base URL of the Gladys host API |
| `token`      | `GLADYS_INTEGRATION_TOKEN` env var    | Integration JWT                 |
| `selector`   | `GLADYS_INTEGRATION_SELECTOR` env var | Integration selector            |

Throws immediately when a value is missing (neither option nor env var).

### Methods

All methods return Promises; host API errors are thrown as `GladysApiError { status, code, message }`.

| Method                                     | Contract                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connect()`                                | Opens the WebSocket, authenticates, resynchronizes (`GET /device` + `GET /config`), then resolves. Reconnects automatically for life with `min(1s * 2^n, 60s)` backoff; every reconnection re-authenticates and resynchronizes |
| `disconnect()`                             | Closes cleanly (no more reconnection)                                                                                                                                                                                          |
| `externalId(suffix)`                       | → `` `ext:${selector}:${suffix}` `` — the only documented way to build an `external_id`                                                                                                                                        |
| `publishDiscoveredDevices(devices)`        | Publishes the complete list of discovered devices (replaces the previous one)                                                                                                                                                  |
| `getDevices()`                             | Devices created by the user; also refreshes `gladys.devices`                                                                                                                                                                   |
| `publishState(featureExternalId, value)`   | `value` is a number, or `{ text }`, or `{ state, created_at }` for a past state                                                                                                                                                |
| `publishStates(states)`                    | Batch (max 100 states per request)                                                                                                                                                                                             |
| `getConfig()` / `setConfig(partialConfig)` | Configuration values; `getConfig` also refreshes `gladys.config`                                                                                                                                                               |
| `getStatus()`                              | Gladys version + integration service status                                                                                                                                                                                    |

### Handlers

Register handlers before `connect()`. Commands are acked automatically: the handler resolves →
`command-result success:true`, it throws → `success:false` with the error message, no handler registered →
`success:false "not implemented"`.

| Handler                                                               | Callback signature                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `onSetValue(cb)`                                                      | `(device, deviceFeature, value) => Promise`                  |
| `onPoll(cb)`                                                          | `(device) => Promise` — respond by publishing states         |
| `onScanRequest(cb)`                                                   | `() => Promise` — respond through `publishDiscoveredDevices` |
| `onDeviceCreated(cb)` / `onDeviceUpdated(cb)` / `onDeviceDeleted(cb)` | `(device) => Promise`                                        |
| `onConfigUpdated(cb)`                                                 | `(config) => Promise` — complete new values                  |

### Local state & lifecycle

The SDK keeps `gladys.devices` (array), `gladys.config` (object) and `gladys.connected` (boolean) up to date —
refreshed on every (re)connection and by the `device-created/updated/deleted` and `config-updated` events. The class
extends `EventEmitter`: listen to `gladys.on('connected')` and `gladys.on('disconnected')`, for example to suspend a
polling loop while Gladys is unreachable.

### Behaviour guarantees

- Responds to WebSocket protocol pings (native to the `ws` library).
- Never logs anything by default (stdout/stderr belong to the integration); set `DEBUG=gladys-integration-sdk` for
  SDK debug logs on stderr.
- Persists nothing on disk: everything resynchronizes, `/data` stays fully owned by the integration.
- Unknown message types are ignored silently (forward compatibility).

## Development

The toolchain is intentionally modern and dependency-light: the native `node:test` runner with
`node:assert/strict` (no test framework), ESLint 10 (flat config) and Prettier 3 run as separate checks, c8 for
coverage thresholds.

```bash
npm install
npm test              # node:test unit tests against a fake Gladys server
npm run coverage      # tests + coverage thresholds (c8)
npm run lint          # ESLint 10, flat config
npm run prettier-check
npm run check-types   # TypeScript typings compile check
```

## License

[Apache-2.0](LICENSE)
