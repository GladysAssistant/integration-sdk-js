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
import {
  GladysIntegration,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  logger,
} from '@gladysassistant/integration-sdk';
// CommonJS works too: const { GladysIntegration } = require('@gladysassistant/integration-sdk');
// (then wrap the `await` calls in an async function — CJS has no top-level await)

// Every option is read from the container env vars by default
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR);
// override them for development outside Docker.
const gladys = new GladysIntegration();

gladys.onScanRequest(async () => {
  // External ids must be unique and stable per device: build them from an
  // identifier that comes from the brand/hardware (serial, MAC, Zigbee address…),
  // never from a generic word like "switch" alone.
  const ids = gladys.externalIds('switch', '0x00158d0001a2b3c4');
  await gladys.publishDiscoveredDevices([
    {
      name: 'Virtual switch',
      external_id: ids.device,
      features: [
        {
          name: 'On/Off',
          external_id: ids.feature('binary'),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
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
  logger.info('New config', config); // stdout → docker logs, level set by LOG_LEVEL
});

gladys.handleShutdown(); // SIGTERM/SIGINT → clean disconnect → exit(0)

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

Advanced options: `reconnectBaseDelay` (default 1000 ms), `reconnectMaxDelay` (default 60000 ms),
`requestTimeout` (default 15000 ms — host API requests are aborted past this delay) and `logger` (the logger used
for the connection lifecycle logs, default `createLogger({ name: 'gladys-sdk' })` — pass
`createLogger({ level: 'silent' })` to silence the SDK entirely).

### Methods

All methods return Promises; host API errors are thrown as `GladysApiError { status, code, message }`.

| Method                                     | Contract                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`                                | Opens the WebSocket, authenticates, resynchronizes (`GET /device` + `GET /config`), then resolves. Reconnects automatically for life with `min(1s * 2^n, 60s)` backoff; every reconnection re-authenticates and resynchronizes. A token refused by Gladys (close code 4000) keeps the loop armed but jumps straight to the max delay — the refusal may be transient, and the integration must never go zombie |
| `disconnect()`                             | Closes cleanly (no more reconnection)                                                                                                                                                                                                                                                                                                                                                                         |
| `externalId(suffix)`                       | → `` `ext:${selector}:${suffix}` `` — the only documented way to build an `external_id`                                                                                                                                                                                                                                                                                                                       |
| `externalIds(type, platformId)`            | → `{ device, feature(key) }` — the ids of ONE physical device. `platformId` must come from the external platform (serial, MAC, Zigbee address…) so the ids stay unique and stable                                                                                                                                                                                                                             |
| `handleShutdown(cleanup?)`                 | Exits gracefully on SIGTERM/SIGINT: runs the optional `(signal) => Promise` cleanup, disconnects cleanly, then `process.exit(0)`                                                                                                                                                                                                                                                                              |
| `publishDiscoveredDevices(devices)`        | Publishes the complete list of discovered devices (replaces the previous one). Re-publishing a device the user already created silently upserts its `params` in Gladys (a LAN IP that changed in DHCP…) without touching its name/features and without a `device-updated` echo; a structure change (features) shows an "Update" button in the Discovery screen instead                                        |
| `getDevices()`                             | Devices created by the user; also refreshes `gladys.devices`                                                                                                                                                                                                                                                                                                                                                  |
| `publishState(featureExternalId, value)`   | `value` is a number, or `{ text }`, or `{ state, created_at }` for a past state                                                                                                                                                                                                                                                                                                                               |
| `publishStates(states)`                    | Batch (max 100 states per request)                                                                                                                                                                                                                                                                                                                                                                            |
| `publishCameraImage(externalId, image)`    | New image of a camera device (`image/jpg;base64,...`, ≤ 150 KB, 12 images/minute per device) — the dashboard camera widget updates in real time. Dedicated channel: images never go through `publishState`                                                                                                                                                                                                    |
| `publishTransports(transports)`            | Per-device transport status badge (`[{ external_id, transport: 'local' \| 'cloud' \| 'unreachable', degraded?, message? }]`, max 100 per request) — the lightweight path for live cloud/local switches, no need to re-publish the discovered devices. `degraded: true` + an optional multi-language `message` flag the "works, but not nominal" state (orange dot on the badge)                               |
| `publishMessage(contactId, text, opts?)`   | Communication integrations: a message received in the external channel. Gladys resolves the contact to the linked user and routes the message to the brain and the chat history; an unknown (not linked) contact is a 404 — answer "account not linked, code required" in the channel. `opts.createdAt` timestamps a message received offline                                                                 |
| `linkContact(code, contactId, name?)`      | Communication integrations: link an external contact to the Gladys user who generated the code from the UI (single use, 15 min TTL). Resolves with the linked user (`{ selector, first_name, language }`); an invalid or expired code is a 404                                                                                                                                                                |
| `getContacts()`                            | Communication integrations: the linked contacts, each with its linked Gladys user                                                                                                                                                                                                                                                                                                                             |
| `getConfig()` / `setConfig(partialConfig)` | Configuration values; `getConfig` also refreshes `gladys.config`                                                                                                                                                                                                                                                                                                                                              |
| `getStatus()`                              | Gladys version + integration service status                                                                                                                                                                                                                                                                                                                                                                   |
| `setConnectionStatus(connected, message?)` | Application-level connection status shown in the Configuration screen (`message` is an optional multi-language object, e.g. `{ en: 'Token expired' }`). Distinct from the container state machine: a cloud integration can be RUNNING and still disconnected from its third-party service                                                                                                                     |
| `getContainers()`                          | Sub-containers declared in the manifest: Docker status, desired state, assigned host ports, granted/available hardware classes                                                                                                                                                                                                                                                                                |
| `startContainer(name, { env }?)`           | Creates (if needed) and starts a declared sub-container — typically after generating its config files in `/data`; `env` carries runtime-computed values (secrets never go through the public manifest)                                                                                                                                                                                                        |
| `stopContainer(name)`                      | Stops a sub-container; the supervisor will not restart it                                                                                                                                                                                                                                                                                                                                                     |
| `restartContainer(name)`                   | Restarts a sub-container, e.g. after rewriting its config through `/data`                                                                                                                                                                                                                                                                                                                                     |
| `scanNetwork(type, { timeoutSeconds }?)`   | On-demand mediated network scan of a capture declared in the manifest `network_discovery` field (`udp-broadcast` \| `mdns` \| `ssdp`); returns the RAW results — parsing them is the integration's job                                                                                                                                                                                                        |

### Handlers

Register handlers before `connect()`. Commands are acked automatically: the handler resolves →
`command-result success:true` — and when the resolved value is not `undefined`, it is sent back in `data` (for
commands that expect an answer) —, it throws → `success:false` with the error message, no handler registered →
`success:false "not implemented"`.

| Handler                                                               | Callback signature                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onSetValue(cb)`                                                      | `(device, deviceFeature, value) => Promise`                                                                                                                                                                                |
| `onPoll(cb)`                                                          | `(device) => Promise` — respond by publishing states                                                                                                                                                                       |
| `onGetImage(cb)`                                                      | `(device) => Promise<string>` — capture and resolve a FRESH camera image (`image/jpg;base64,...`, ≤ 150 KB); acked back as `data.image`, awaited under 15 s (not 5 s) so an ffmpeg-style capture fits                      |
| `onScanRequest(cb)`                                                   | `() => Promise` — respond through `publishDiscoveredDevices`                                                                                                                                                               |
| `onDeviceCreated(cb)` / `onDeviceUpdated(cb)` / `onDeviceDeleted(cb)` | `(device) => Promise`                                                                                                                                                                                                      |
| `onConfigUpdated(cb)`                                                 | `(config) => Promise` — complete new values                                                                                                                                                                                |
| `onHardwareUpdated(cb)`                                               | `(containers) => Promise` — the hardware grants changed: regenerate the affected configs, then `startContainer`/`restartContainer`                                                                                         |
| `onOAuthAuthorizeUrl(cb)`                                             | `(key, redirectUri) => Promise<string>` — build the provider authorization URL (client_id from the config, scopes, a `state` you generate and remember)                                                                    |
| `onOAuthCallback(cb)`                                                 | `(key, { code, state, redirectUri }) => Promise` — verify `state`, exchange the tokens, store them via `setConfig`, then `setConnectionStatus(true)`                                                                       |
| `onAction(key, cb)`                                                   | `(fields) => Promise<string \| object>` — handler of ONE action declared in the manifest, registered per `key`; the resolved message is shown under the button (ack awaited under the action's `timeout_seconds`, not 5 s) |
| `onSendMessage(cb)`                                                   | `(contactId, message) => Promise` — communication integrations: deliver `message` (`{ text, file }`) to the contact in the external channel                                                                                |

### Manifest actions

For on-demand operations with a visible result — connection test, identify, re-pairing, protocol detection… —
declare `actions` in the manifest: each one is rendered as a button (with an optional mini-form, `fields`) in the
Configuration screen. The Tuya-style example: detect the protocol version of a device whose IP was typed by hand
because the UDP scan did not find it — a long operation, hence the per-action `timeout_seconds` (5–120 s, default 30) replacing the standard 5 s ack delay:

```json
"actions": [
  {
    "key": "detect_protocol",
    "label": { "en": "Detect protocol version", "fr": "Détecter la version de protocole" },
    "timeout_seconds": 30,
    "fields": [
      { "key": "ip", "type": "string", "label": { "en": "Device IP" }, "required": true }
    ]
  }
]
```

```js
gladys.onAction('detect_protocol', async (fields) => {
  const version = await tryProtocolVersions(fields.ip); // your protocol code, can take ~15 s
  return { en: `Protocol ${version} detected`, fr: `Protocole ${version} détecté` };
});
```

The resolved value — a string or a multi-language object — is displayed under the button; throwing displays the
error message instead.

#### Acting on a specific device: dynamic selects (`source: "devices"`)

A `select`/`multi_select` field — in an action's `fields` or in the manifest `config_schema` — can replace its
static `options` with `"source"`, a core-defined enum (never a URL nor an expression). V1's only value is
**`"devices"`**: the Configuration screen populates the options with the **integration's own created devices**
(label = device name, value = `external_id`). This is the answer to "act on THIS device" without asking the user
to copy an identifier — the handler receives the chosen `external_id` like any other field value. Declaring
`source` and `options` together, or an unknown `source` value, rejects the manifest.

```json
"actions": [
  {
    "key": "identify",
    "label": { "en": "Identify device", "fr": "Identifier l'appareil" },
    "fields": [
      { "key": "device", "type": "select", "source": "devices", "label": { "en": "Device", "fr": "Appareil" }, "required": true }
    ]
  }
]
```

```js
gladys.onAction('identify', async (fields) => {
  await blinkDevice(fields.device); // fields.device is the chosen device external_id
  return { en: 'Device identified', fr: 'Appareil identifié' };
});
```

### OAuth2 cloud services

For cloud services that need a browser authorization (Netatmo-style), declare a field of type `oauth2` in the
manifest `config_schema`: the Configuration screen renders a "Connect" button, and Gladys relays the whole flow to
the integration — the Gladys server knows no provider.

```js
let state;

gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => {
  // Build the URL yourself: client_id from your config, your scopes, and an
  // anti-CSRF `state` you generate and remember for the callback.
  state = crypto.randomUUID();
  return `https://api.netatmo.com/oauth2/authorize?client_id=${gladys.config.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read_station&state=${state}`;
});

gladys.onOAuthCallback(async (key, { code, state: returnedState, redirectUri }) => {
  if (returnedState !== state) throw new Error('state mismatch');
  const tokens = await exchangeCodeForTokens(code, redirectUri); // your provider call
  // Store the tokens as config keys OUTSIDE the config_schema: free internal
  // storage, never shown in the UI, never sent through the front.
  await gladys.setConfig({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  await gladys.setConnectionStatus(true);
});
```

Token refresh stays the integration's job; when the token expires beyond repair, report it so the user sees it in
the UI instead of a silently broken integration:

```js
await gladys.setConnectionStatus(false, { en: 'Token expired, please reconnect.', fr: 'Token expiré.' });
```

### Communication channels

Messaging channels (Telegram-like bots — Matrix, Signal, WhatsApp…) are integrations of manifest
`type: "communication"`: no Devices/Discovery screens, the user links their account from the Configuration screen
of the Gladys UI, and the integration exchanges messages through the host API. Three building blocks:

- **Linking** — the consent step. The user clicks "Link my account" in the Gladys UI, which shows a short code
  (single use, 15 minutes TTL); they send it to the bot in the external channel, and the integration relays it
  with `linkContact(code, contactId, contactName?)`. From then on the contact speaks with the authority of the
  linked user (trigger scenes, ask about the house…) — which is exactly why the code flow exists. The user can
  revoke the link from the same screen at any time.
- **Incoming** — `publishMessage(contactId, text)`: Gladys resolves the contact to the linked user and routes the
  message to the brain and the chat history; the reply comes back through `onSendMessage`. An unknown contact is
  rejected with a 404: catch it and answer "account not linked" with the linking instructions.
- **Outgoing** — `onSendMessage`: replies of the brain and notifications forwarded to a linked user (scenes,
  alerts…), delivered by the integration in the external channel.

```js
gladys.onSendMessage(async (contactId, message) => {
  await bot.sendMessage(contactId, message.text); // message.file: attached image (base64) or null
});

bot.on('message', async (chatId, text) => {
  if (looksLikeLinkCode(text)) {
    const user = await gladys.linkContact(text.trim(), chatId, await bot.getChatName(chatId));
    await bot.sendMessage(chatId, `Linked to ${user.first_name}!`);
    return;
  }
  try {
    await gladys.publishMessage(chatId, text);
  } catch (e) {
    if (e.status === 404) {
      await bot.sendMessage(chatId, 'Account not linked: get a code from the Gladys UI and send it to me.');
    } else {
      throw e;
    }
  }
});
```

Texts are limited to 4096 characters. `getContacts()` lists the linked contacts (with their linked Gladys user),
e.g. to resynchronize the channel-side state after a restart. Requires a Gladys with communication-integrations
support (check the `gladys_version` range of your manifest).

### Camera images

A camera is a regular device carrying a `camera`/`image` feature (`DEVICE_FEATURE_CATEGORIES.CAMERA` +
`DEVICE_FEATURE_TYPES.CAMERA.IMAGE`), declared like any feature in the discovered devices. Two complementary
paths, both using the same `image/jpg;base64,...` format (≤ 150 KB):

- **Push** — publish a periodic snapshot with `publishCameraImage` (12 images/minute per device, i.e. one every
  5 s; the continuous video stream is out of scope). The dashboard camera widget updates in real time.
- **Pull** — answer `onGetImage` with a fresh capture when Gladys asks for one (live view of the dashboard
  widget, chat intent "show me the camera"). The ack is awaited under **15 s** instead of the standard 5 s, so an
  ffmpeg-style capture fits.

```js
gladys.onGetImage(async (device) => {
  const jpeg = await captureSnapshot(device); // your camera code (ffmpeg, HTTP snapshot URL…)
  return `image/jpg;base64,${jpeg.toString('base64')}`;
});

// And/or push a snapshot on your own schedule:
await gladys.publishCameraImage(ids.device, `image/jpg;base64,${jpeg.toString('base64')}`);
```

Images never go through `publishState`: dedicated channel, out of the states history and of the 300 states/minute
rate limit.

### Cloud/local transport badge

Dual-channel integrations (Tuya cloud+LAN, Shelly, eWeLink…) can reach the same device through different
transports, per device and changing over time — without a visible hint the user cannot diagnose a slow or frozen
device. Publish the **effective transport of each device** and Gladys renders it as a badge on the device cards
(with a global summary), in real time:

```js
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';

await gladys.publishTransports([
  { external_id: ids.device, transport: DEVICE_TRANSPORTS.LOCAL }, // 'local' | 'cloud' | 'unreachable'
]);
```

This is the lightweight path for live switches (the cloud link drops → `unreachable`, the LAN comes back →
`local`) — no need to re-publish the discovered devices. Purely declarative: the cloud/local logic stays in the
integration, Gladys only displays it.

#### Degraded state

Some situations are "it works, but not in the nominal mode" — a case the three transport values cannot express.
Field example: the device is seen by the local scan but refuses local sessions (rotated local key, another client
holding the connection…) and the integration falls back to cloud — the user sees a perfectly normal `cloud` badge
and nothing invites them to investigate. Flag those entries as **degraded**, with an optional multi-language
`message` (`en` mandatory, ≤ 200 characters per language) giving the reason:

```js
await gladys.publishTransports([
  {
    external_id: ids.device,
    transport: DEVICE_TRANSPORTS.CLOUD,
    degraded: true,
    message: { en: 'Local session refused, falling back to cloud', fr: 'Session locale refusée, bascule cloud' },
  },
]);
```

The badge keeps its transport color with an **orange dot** overlay, and the tooltip shows the message (the global
summary gains a "degraded" count). Degraded is intentionally **orthogonal to the transport** — not a fourth value:
"which channel is in use right now" and "is this the nominal state" are two different pieces of information, and
their combination ("cloud **and** degraded") is what makes the situation diagnosable. Publishing an entry
**without** `degraded` explicitly clears a previously published degraded state — back to nominal, no ghost orange
dot.

Declare the channels the integration supports in the manifest `transports` field (`["local"]`, `["cloud"]` or
both). When both are declared, the Configuration screen shows a standard **"Prefer the local connection"** toggle,
rendered and translated by the core; the integration receives it as the reserved config key
**`GLADYS_PREFER_LOCAL`** (boolean, default `true`) — in `gladys.config` and through `onConfigUpdated`, like any
key, but read-only for the integration (it is a user preference). The preference is a wish, not an order: apply it
when you can, and reflect the per-device reality through `publishTransports`.

```js
gladys.onConfigUpdated(async (config) => {
  usePreferLocal(config.GLADYS_PREFER_LOCAL !== false); // re-route what can be re-routed…
  await gladys.publishTransports(currentTransports()); // …and reflect the actual outcome
});
```

### Sub-containers

Integrations that declare additional containers in their manifest (`containers` field — e.g. a Frigate + Mosquitto
stack) drive their lifecycle through the host API, within the declared bounds. The typical pattern: generate the
config files under `/data/containers/<name>/…`, then start (or restart) the container.

```js
await fs.writeFile('/data/containers/mqtt/mosquitto/config/passwd', passwordFile);
await gladys.startContainer('mqtt', { env: { MQTT_PASSWORD: password } });

const containers = await gladys.getContainers();
const frigate = containers.find((c) => c.name === 'frigate');
const coral = frigate.devices.find((d) => d.class === 'coral-usb');
const detector = coral.granted && coral.available ? 'edgetpu' : 'cpu'; // adapt to what the user granted
```

When the user changes the hardware grants, the affected sub-containers are recreated and `onHardwareUpdated` fires:
regenerate the configs and (re)start what is needed.

### Mediated network discovery

Integration containers run on a bridge network: LAN **broadcast, mDNS and SSDP traffic never reaches them** (only
outgoing unicast crosses the NAT). Local discovery (Tuya-style UDP announcements, Hue mDNS…) therefore goes through
the core, which runs on the host network: **the core captures (network position), the integration interprets
(protocol knowledge)** — the core never parses anything.

Declare what may be captured in the manifest `network_discovery` field (shown to the user on the install screen,
like `containers` and hardware classes — undeclared captures are rejected with a 403):

```json
"network_discovery": [
  { "type": "udp-broadcast", "ports": [6666, 6667, 7000] },
  { "type": "mdns", "service": "_hue._tcp" }
]
```

Then scan on demand (typically from `onScanRequest`), parse the raw results yourself, join the devices through
unicast, and publish them:

```js
gladys.onScanRequest(async () => {
  // Tuya-style: the devices announce themselves in UDP broadcast on the LAN.
  const announcements = await gladys.scanNetwork('udp-broadcast', { timeoutSeconds: 10 });
  const devices = announcements.map(({ source_ip, payload_base64 }) => {
    const announcement = decodeTuyaPayload(Buffer.from(payload_base64, 'base64')); // your protocol code
    const ids = gladys.externalIds('plug', announcement.gwId);
    return {
      name: `Tuya ${announcement.gwId}`,
      external_id: ids.device,
      // Keep the IP to reach the device in unicast afterwards (unicast crosses the NAT).
      params: [{ name: 'IP_ADDRESS', value: source_ip }],
      features: [],
    };
  });
  await gladys.publishDiscoveredDevices(devices);
});
```

Raw result shapes: `udp-broadcast` → `[{ source_ip, source_port, payload_base64 }]` (one entry per received
datagram), `mdns` → `[{ name, host, addresses, port, txt }]`, `ssdp` → the raw headers per responder. Scans are
synchronous and bounded (`timeoutSeconds` 1–30); requires a Gladys with mediated-discovery support (check the
`gladys_version` range of your manifest).

### Publishing states efficiently

The host API rate-limits `POST /state` at **300 states per minute** per integration, sized for state _changes_,
not full snapshots. An integration polling a large fleet (e.g. 50 Tuya devices × 6 features) must deduplicate and
publish only the values that actually changed:

```js
const lastValues = new Map();
const changed = readings.filter(({ id, value }) => lastValues.get(id) !== value);
changed.forEach(({ id, value }) => lastValues.set(id, value));
await gladys.publishStates(changed.map(({ id, value }) => ({ device_feature_external_id: id, state: value })));
```

### Device constants

The SDK exports the canonical category / type / unit strings understood by Gladys — a verbatim mirror of
`server/utils/constants.js` in the Gladys repository — so integrations never have to hand-copy (and typo) them.
The TypeScript typings declare every value as a string literal, so your editor autocompletes them.

```js
import {
  DEVICE_FEATURE_CATEGORIES, // { TEMPERATURE_SENSOR: 'temperature-sensor', SWITCH: 'switch', … }
  DEVICE_FEATURE_TYPES, // grouped by category: { SWITCH: { BINARY: 'binary', POWER: 'power', … }, … }
  DEVICE_FEATURE_UNITS, // { CELSIUS: 'celsius', PERCENT: 'percent', WATT: 'watt', … }
} from '@gladysassistant/integration-sdk';
```

### Logger

The SDK ships the standard integration logger, so every integration does not have to reimplement one. Integration
logs are captured by the Gladys supervisor through the container stdout/stderr: `debug`/`info` write to stdout,
`warn`/`error` to stderr, each line prefixed with an ISO timestamp and the level.

```js
import { logger, createLogger } from '@gladysassistant/integration-sdk';

logger.info('Starting the integration...');
logger.error('Something failed', err);

// Optional: named loggers for the modules of the integration.
const log = createLogger({ name: 'weather-station' });
log.child('poll').debug('refreshing'); // [2026-…Z] [DEBUG] [weather-station:poll] refreshing
```

The level is read from the `LOG_LEVEL` environment variable (`debug` | `info` | `warn` | `error` | `silent`,
case-insensitive, default: `info`; an unknown value falls back to `info`), or pinned with `createLogger({ level })` — handy to silence
an integration's own logs in its tests.

The SDK itself logs its **connection lifecycle** through this logger (under the `gladys-sdk` name), so connectivity
problems are diagnosable from `docker logs` without any configuration: successful (re)connections (`info`), lost
connections and reconnection attempts (`warn`), WebSocket errors, refused tokens and failed resynchronizations
(`error`). The `logger` constructor option replaces it — pass `createLogger({ level: 'silent' })` to keep the SDK
silent, or your own logger to route the lines elsewhere.

### Local state & lifecycle

The SDK keeps `gladys.devices` (array), `gladys.config` (object) and `gladys.connected` (boolean) up to date —
refreshed on every (re)connection and by the `device-created/updated/deleted` and `config-updated` events. The class
extends `EventEmitter`: listen to `gladys.on('connected')` and `gladys.on('disconnected')`, for example to suspend a
polling loop while Gladys is unreachable.

### Behaviour guarantees

- Responds to WebSocket protocol pings (native to the `ws` library).
- Logs the connection lifecycle only (see the Logger section) — silenceable with the `logger` option; everything
  else stays silent unless `DEBUG=gladys-integration-sdk` enables the SDK debug logs on stderr.
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
