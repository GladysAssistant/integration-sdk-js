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

| Method                                     | Contract                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`                                | Opens the WebSocket, authenticates, resynchronizes (`GET /device` + `GET /config`), then resolves. Reconnects automatically for life with `min(1s * 2^n, 60s)` backoff; every reconnection re-authenticates and resynchronizes. A token refused by Gladys (close code 4000) keeps the loop armed but jumps straight to the max delay — the refusal may be transient, and the integration must never go zombie                         |
| `disconnect()`                             | Closes cleanly (no more reconnection)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `externalId(suffix)`                       | → `` `ext:${selector}:${suffix}` `` — the only documented way to build an `external_id`                                                                                                                                                                                                                                                                                                                                               |
| `externalIds(type, platformId)`            | → `{ device, feature(key) }` — the ids of ONE physical device. `platformId` must come from the external platform (serial, MAC, Zigbee address…) so the ids stay unique and stable                                                                                                                                                                                                                                                     |
| `handleShutdown(cleanup?)`                 | Exits gracefully on SIGTERM/SIGINT: runs the optional `(signal) => Promise` cleanup, disconnects cleanly, then `process.exit(0)`                                                                                                                                                                                                                                                                                                      |
| `publishDiscoveredDevices(devices)`        | Publishes the complete list of discovered devices (replaces the previous one). Re-publishing a device the user already created silently upserts its `params` and its features' `supported_options` in Gladys (a LAN IP that changed in DHCP, a camera preset renamed…) without touching its name/features and without a `device-updated` echo; a structure change (features) shows an "Update" button in the Discovery screen instead |
| `getDevices()`                             | Devices created by the user; also refreshes `gladys.devices`                                                                                                                                                                                                                                                                                                                                                                          |
| `publishState(featureExternalId, value)`   | `value` is a number, or `{ text }`, or `{ state, created_at }` for a past state                                                                                                                                                                                                                                                                                                                                                       |
| `publishStates(states)`                    | Batch (max 100 states per request)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `publishCameraImage(externalId, image)`    | New image of a camera device (`image/jpg;base64,...`, ≤ 150 KB, 12 images/minute per device) — the dashboard camera widget updates in real time. Dedicated channel: images never go through `publishState`                                                                                                                                                                                                                            |
| `publishTransports(transports)`            | Per-device transport status badge (`[{ external_id, transport: 'local' \| 'cloud' \| 'unreachable', degraded?, message? }]`, max 100 per request) — the lightweight path for live cloud/local switches, no need to re-publish the discovered devices. `degraded: true` + an optional multi-language `message` flag the "works, but not nominal" state (orange dot on the badge)                                                       |
| `publishMessage(contactId, text, opts?)`   | Communication integrations: a message received in the external channel. Gladys resolves the contact to the linked user and routes the message to the brain and the chat history; an unknown (not linked) contact is a 404 — answer "account not linked, code required" in the channel. `opts.createdAt` timestamps a message received offline. Bidirectional channels only: a send-only channel (`messaging.receive: false`) is a 403 |
| `linkContact(code, contactId, name?)`      | Communication integrations: link an external contact to the Gladys user who generated the code from the UI (single use, 15 min TTL). Resolves with the linked user (`{ selector, first_name, language }`); an invalid or expired code is a 404                                                                                                                                                                                        |
| `getContacts()`                            | Communication integrations: the linked contacts, each with its linked Gladys user                                                                                                                                                                                                                                                                                                                                                     |
| `requestWeatherRefresh()`                  | Weather integrations: fire-and-forget freshness nudge — asks the core to re-pull the weather NOW (through `onWeatherGet`) and re-evaluate the weather-alert scene triggers, instead of waiting for the 30-minute scheduled check. Carries no data, expects no answer; rate-limited core-side (1/min per integration, silently dropped beyond), dropped silently while disconnected                                                    |
| `getWebhooks()`                            | Gladys Plus webhook state: `{ available, webhooks: [{ key, mode, url }] }` — the ready-to-register public URL of each webhook declared in the manifest. `available: false` (no Gladys Plus linked) → degrade to poll only                                                                                                                                                                                                             |
| `getConfig()` / `setConfig(partialConfig)` | Configuration values; `getConfig` also refreshes `gladys.config`                                                                                                                                                                                                                                                                                                                                                                      |
| `getStatus()`                              | Gladys version + integration service status                                                                                                                                                                                                                                                                                                                                                                                           |
| `setConnectionStatus(connected, message?)` | Application-level connection status shown in the Configuration screen (`message` is an optional multi-language object, e.g. `{ en: 'Token expired' }`). Distinct from the container state machine: a cloud integration can be RUNNING and still disconnected from its third-party service                                                                                                                                             |
| `getContainers()`                          | Sub-containers declared in the manifest: Docker status, desired state, published ports (`{ container_port, protocol, host_port, label, name, browsable }`, `host_port: null` while none is assigned yet), granted/available hardware classes                                                                                                                                                                                          |
| `startContainer(name, { env }?)`           | Creates (if needed) and starts a declared sub-container — typically after generating its config files in `/data`; `env` carries runtime-computed values (secrets never go through the public manifest)                                                                                                                                                                                                                                |
| `stopContainer(name)`                      | Stops a sub-container; the supervisor will not restart it                                                                                                                                                                                                                                                                                                                                                                             |
| `restartContainer(name)`                   | Restarts a sub-container, e.g. after rewriting its config through `/data`                                                                                                                                                                                                                                                                                                                                                             |
| `scanNetwork(type, options?)`              | On-demand mediated network scan of a capture declared in the manifest `network_discovery` field (`udp-broadcast` \| `udp-active-broadcast` \| `mdns` \| `ssdp`); returns the RAW results — parsing them is the integration's job. `udp-active-broadcast` (query/response, TP-Link Kasa style) additionally takes `{ port, payload }`: the integration forges the request, the core broadcasts it and relays the raw unicast replies   |
| `wakeOnLan(mac, options?)`                 | Sends a standard Wake-on-LAN magic packet from the Gladys core network namespace (bridge containers cannot reach the LAN in broadcast). Requires `network_wake: true` in the manifest (403 otherwise); the core builds the fixed magic packet itself (never integration-provided bytes) and bounds the rate to 1 wake per 2 s per integration (429 beyond). Options: `{ address, port, sourcePort }`                                  |

### Handlers

Register handlers before `connect()`. Commands are acked automatically: the handler resolves →
`command-result success:true` — and when the resolved value is not `undefined`, it is sent back in `data` (for
commands that expect an answer) —, it throws → `success:false` with the error message, no handler registered →
`success:false "not implemented"`.

| Handler                                                               | Callback signature                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onSetValue(cb)`                                                      | `(device, deviceFeature, value) => Promise` — `value` is a number, except on the `text` category features whose commands are strings (the free text of `text`/`text`, the selected option value of a `text`/`select` dynamic select)                                                                                                               |
| `onPoll(cb)`                                                          | `(device) => Promise` — respond by publishing states                                                                                                                                                                                                                                                                                               |
| `onGetImage(cb)`                                                      | `(device) => Promise<string>` — capture and resolve a FRESH camera image (`image/jpg;base64,...`, ≤ 150 KB); acked back as `data.image`, awaited under 15 s (not 5 s) so an ffmpeg-style capture fits                                                                                                                                              |
| `onScanRequest(cb)`                                                   | `() => Promise` — respond through `publishDiscoveredDevices`                                                                                                                                                                                                                                                                                       |
| `onDeviceCreated(cb)` / `onDeviceUpdated(cb)` / `onDeviceDeleted(cb)` | `(device) => Promise`                                                                                                                                                                                                                                                                                                                              |
| `onConfigUpdated(cb)`                                                 | `(config) => Promise` — complete new values                                                                                                                                                                                                                                                                                                        |
| `onHardwareUpdated(cb)`                                               | `(containers) => Promise` — the hardware grants changed: regenerate the affected configs, then `startContainer`/`restartContainer`                                                                                                                                                                                                                 |
| `onOAuthAuthorizeUrl(cb)`                                             | `(key, redirectUri) => Promise<string>` — build the provider authorization URL (client_id from the config, scopes, a `state` you generate and remember). Also called for an `account_link` field (a provider that never redirects back), with `redirectUri` undefined and no callback to expect                                                    |
| `onOAuthCallback(cb)`                                                 | `(key, { code, state, redirectUri }) => Promise` — verify `state`, exchange the tokens, store them via `setConfig`, then `setConnectionStatus(true)`                                                                                                                                                                                               |
| `onAction(key, cb)`                                                   | `(fields) => Promise<string \| object>` — handler of ONE action declared in the manifest, registered per `key`; the resolved message is shown under the button (ack awaited under the action's `timeout_seconds`, not 5 s)                                                                                                                         |
| `onSendMessage(cb)`                                                   | `(contact, message) => Promise` — communication integrations: deliver `message` (`{ text, file }`) in the external channel. `contact` is the identity resolved by Gladys: `{ id }` for a channel linked by code (`messaging.receive: true`), or the target user's `contact_schema` values for a send-only channel (`receive: false`)               |
| `onWeatherGet(cb)`                                                    | `(options) => Promise<object>` — weather integrations (manifest `type: "weather"`): `options = { latitude, longitude, language, units }`; resolve the pivot weather format with values in the requested unit system (`'metric'` or `'us'`), it is acked back as `data.weather` (awaited under 15 s, not 5 s, so a fresh third-party API call fits) |
| `onWeatherGetImage(cb)`                                               | `(key) => Promise<string>` — weather integrations: resolve the RAW base64 (no `data:` URI prefix) of a provider image declared in the pivot's `images` metadata (vigilance map, rain radar…); PNG or JPEG, ≤ 500 KB decoded, acked back as `data.image` (awaited under 15 s), validated and cached 10 minutes by the core                          |
| `onWebhook(key, cb)`                                                  | `({ method, query, body, contentType }) => Promise` — handler of ONE webhook declared in the manifest, registered per `key`. `fire_and_forget`: the resolved value is ignored; `sync`: resolve `{ status?, contentType?, body? }` and it is returned to the third party through Gladys Plus                                                        |
| `onWebhookUpdated(cb)`                                                | `({ available, webhooks }) => Promise` — the Gladys Plus webhook availability changed (Plus linked/unlinked, key changed): re-register the fresh URLs at the third party, or degrade to poll only                                                                                                                                                  |

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

### Onboarding guidance: `section` intro blocks and the Documentation link

A generated form is compact, but it gives no room for onboarding guidance — the Netatmo-style case: in front of
"Client ID", the user must first know they have to create an app on the manufacturer's developer platform. Declare
fields of type **`section`** in the manifest `config_schema` (and in an action's `fields`, which share the format):
purely presentational intro blocks that split the form into chapters. Since `config_schema` is an ordered list,
sections naturally structure large forms.

```json
"config_schema": [
  {
    "key": "intro",
    "type": "section",
    "label": { "en": "Getting started", "fr": "Pour commencer" },
    "description": { "en": "Create a developer account to get your API key.", "fr": "Créez un compte développeur pour obtenir votre clé d'API." },
    "links": [ { "url": "https://open-meteo.com/en/docs", "label": { "en": "Open-Meteo docs", "fr": "Doc Open-Meteo" } } ]
  },
  { "key": "api_key", "type": "secret", "label": { "en": "API key" }, "required": true }
]
```

A `section` carries a `label` (multi-language, `en` mandatory — the chapter title), a plain-text `description`
(multi-language, ≤ 1000 characters per language) and optional `links` (≤ 5 entries `[{ url, label }]`, **https
mandatory**). The core renders a visual separator + text + links opened in a new tab with the **target domain
displayed** next to the label — no markdown, no HTML (declarative UI principle). Declaring `required`, `default` or
`placeholder` on a section, or a non-https `url`, rejects the manifest.

A section stores **no value**: its key never appears in `gladys.config`, `getConfig()`, `onConfigUpdated` values or
an action handler's `fields`, and sending it through `setConfig` is rejected by the host API.

#### Placeholders in section texts: `{{gladys_host}}` and `{{port:<name>}}`

Some integrations have to show the user a URL pointing **at Gladys itself** — the OCPP case: "configure your charge
point to `ws://<gladys>:<port>`". The server cannot build that address reliably (it does not know which LAN address
the user reaches Gladys by: several interfaces, reverse proxy, VPN), but the **browser knows it by construction**.
So the `label` and `description` of a `section` may embed two plain-text tokens, substituted by the Gladys frontend
at render time — exact syntax, no space inside the braces, no expression and no injected code (declarative UI
principle):

| Token             | Substituted with                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `{{gladys_host}}` | The hostname of the address the browser currently uses to reach Gladys                            |
| `{{port:<name>}}` | The host port Gladys assigned to the declared sub-container port carrying that `name` (see below) |

```json
"containers": [
  {
    "name": "ocpp",
    "docker_image": "ghcr.io/acme/ocpp:1.2.0",
    "ports": [{ "container_port": 9000, "name": "ocpp", "label": { "en": "OCPP endpoint" }, "browsable": false }]
  }
],
"config_schema": [
  {
    "key": "charge_point",
    "type": "section",
    "label": { "en": "Connect your charge point" },
    "description": {
      "en": "Point your charge point to ws://{{gladys_host}}:{{port:ocpp}}/",
      "fr": "Pointez votre borne vers ws://{{gladys_host}}:{{port:ocpp}}/"
    }
  }
]
```

Rules to know when writing the manifest:

- a `{{port:<name>}}` that references a name declared **nowhere** in the manifest **rejects the manifest** (indexer
  and server, like any structural error) — an unknown reference would sit unresolved on screen forever;
- `{{gladys_host}}` works in every section the engine renders (`config_schema`, action `fields`, `contact_schema`),
  since the browser resolves it whatever the user's role; `{{port:<name>}}` is **refused in `contact_schema`**: that
  per-user block is the one screen a non-admin reaches, and their reduced view carries no container state, so the
  token would resolve for an admin and stay raw for everyone else;
- a valid `{{port:<name>}}` whose port has **no assigned host port yet** (sub-container never started) is left
  **as-is** on screen — honest and debuggable, it resolves the next time the screen is loaded after the allocation.
  Start the sub-container that publishes the port before pointing the user at the sentence;
- browsing through Gladys Plus or a reverse proxy, `{{gladys_host}}` resolves to the tunnel/proxy hostname, not to
  the instance's LAN address — if the device must reach Gladys over the LAN, say so in the repo documentation.

For the long step-by-step (screenshots…), the right medium stays the mandatory repo documentation
(`docs/en.md` + `docs/fr.md`): the Configuration screen now shows a permanent **"Documentation"** link to it
(re-hosted, user language with `en` fallback) — it is when configuring that the user needs it most.

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

Some providers link an account **without ever redirecting back** to Gladys — a QR sign-in approved in the vendor
app (Xiaomi Home style), a pairing confirmed on a device. Declare the field as `account_link` instead of `oauth2`:
the Configuration screen renders the same "Connect" button and `onOAuthAuthorizeUrl` is called the same way, but
`redirectUri` is `undefined` (there is none), no anti-CSRF `state` is needed (there is no round trip to protect)
and `onOAuthCallback` is never called. Return the provider sign-in URL, watch for the approval yourself (long-poll
the provider), then report it through `setConnectionStatus(true)` — that is what drives the connection badge.

### Incoming webhooks through Gladys Plus

Some cloud services push their events by webhook (Netatmo-style: a setpoint change arrives in ~2-3 s instead of the
next poll) — but a local Gladys is not reachable from the Internet. Declare the webhooks in the manifest (≤ 3
entries) and **Gladys Plus relays them** to the integration, without knowing anything about it:

```json
"webhooks": [
  { "key": "events", "label": { "en": "Netatmo events" }, "mode": "fire_and_forget" },
  { "key": "callback", "label": { "en": "Subscription callback" }, "mode": "sync" }
]
```

The user pastes their Gladys Plus Open API key in the "Gladys Plus webhooks" block of the Configuration screen
(rendered by the core when the manifest declares `webhooks`), and Gladys builds the public URLs. The integration
registers them at the third party — the Netatmo pattern: re-register on every successful connection, best effort:

```js
const registerWebhooks = async () => {
  const { available, webhooks } = await gladys.getWebhooks();
  if (!available) return; // no Gladys Plus linked: poll only
  const events = webhooks.find((w) => w.key === 'events');
  await thirdPartyApi.addWebhook(events.url); // your provider call
};

gladys.on('connected', registerWebhooks);
gladys.onWebhookUpdated(registerWebhooks); // Plus linked/unlinked, key changed

gladys.onWebhook('events', async ({ body }) => {
  // Doctrine "trigger, not data": events arrive duplicated, late or out of
  // order, and their payloads are partial — use them to TRIGGER a refresh
  // through the manufacturer API, never apply the payload as a state. That is
  // also what makes lost events painless: the poll stays the source of truth.
  await refreshFromApi();
});
```

Two modes, matching what exists in the field. **`fire_and_forget`** (default, the Netatmo-style event stream): the
third party only awaits an acknowledgment — Gladys answers immediately and relays asynchronously; the handler's
resolved value is ignored and its errors are swallowed. **`sync`** (challenge/response registrations,
Strava/Microsoft Graph style): the caller awaits the integration response — resolve with
`{ status?, contentType?, body? }` (status 200-499, body ≤ 64 KB) and it is returned verbatim to the third party;
resolving `undefined` or throwing lets Gladys answer its default empty `200`:

```js
gladys.onWebhook('callback', async ({ query }) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ 'hub.challenge': query['hub.challenge'] }),
}));
```

Security, stated honestly: the URL **is** the secret (payloads are not authenticated — verifying the provider
signature, when one exists, is the integration's job), and requires a Gladys with webhook-relay support (check the
`gladys_version` range of your manifest).

### Communication channels

Messaging channels are integrations of manifest `type: "communication"`: no Devices/Discovery screens, and the
integration exchanges messages through the host API. The manifest declares which of the **two families** the
channel belongs to — sending is always present, receiving is not:

```json
"messaging": { "receive": true }
```

- **Bidirectional chat channels** (`receive: true` — Telegram-like bots: Matrix, Signal, WhatsApp…): the user
  links their account by code from the Configuration screen, then speaks to the brain from the channel.
- **Send-only notification channels** (`receive: false` — Free Mobile SMS, CallMeBot…): no incoming path exists.
  Each user enters their own credentials in the "My account" block of the Configuration screen, described by the
  manifest **`contact_schema`** (same flat format as `config_schema`); Gladys passes them to the integration with
  every outgoing message. No linking code — there is no channel to send it through, and no user authority to
  protect (the `403` on `publishMessage` guarantees a notification channel never talks to the brain).

The identity handling follows: `onSendMessage(contact, message)` receives the identity **resolved by Gladys** —
`{ id }` (the linked contact id) for a bidirectional channel, or the target user's `contact_schema` values for a
send-only one. Users without a linked account or configured credentials are skipped by Gladys and never reach the
handler.

A send-only channel is just the outgoing block (the Free Mobile-style case):

```json
"messaging": { "receive": false },
"contact_schema": [
  { "key": "username", "type": "string", "label": { "en": "Free Mobile login" }, "required": true },
  { "key": "access_token", "type": "secret", "label": { "en": "SMS API key" }, "required": true }
]
```

```js
gladys.onSendMessage(async (contact, message) => {
  // contact = the target user's contact_schema values.
  await sendFreeMobileSms(contact.username, contact.access_token, message.text);
});
```

A bidirectional channel adds the linking and incoming blocks:

- **Linking** — the consent step. The user clicks "Link my account" in the Gladys UI, which shows a short code
  (single use, 15 minutes TTL); they send it to the bot in the external channel, and the integration relays it
  with `linkContact(code, contactId, contactName?)`. From then on the contact speaks with the authority of the
  linked user (trigger scenes, ask about the house…) — which is exactly why the code flow exists. The user can
  revoke the link from the same screen at any time.
- **Incoming** — `publishMessage(contactId, text)`: Gladys resolves the contact to the linked user and routes the
  message to the brain and the chat history; the reply comes back through `onSendMessage`. An unknown contact is
  rejected with a 404: catch it and answer "account not linked" with the linking instructions.

```js
gladys.onSendMessage(async (contact, message) => {
  await bot.sendMessage(contact.id, message.text); // message.file: attached image (base64) or null
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

### Weather providers

Weather providers (Météo France, Open-Meteo, AccuWeather…) are integrations of manifest `type: "weather"`: no
Devices/Discovery screens (like communication channels), no devices and no states — a **dedicated provider API**.
The integration answers the core's weather requests, and Gladys feeds the dashboard weather widget and the chat
assistant with them. Installing a weather integration takes precedence over the built-in OpenWeather service with
zero configuration; stopping or uninstalling it falls back automatically.

Everything goes through one handler:

```js
gladys.onWeatherGet(async ({ latitude, longitude, language, units }) => {
  const data = await fetchProviderForecast(latitude, longitude, language, units); // your provider code
  return {
    // Required: temperature, weather (condition), datetime.
    temperature: data.current.temperature,
    weather: WEATHER_CONDITIONS.RAIN,
    datetime: new Date().toISOString(),
    // Optional current fields, dropped when your provider lacks them:
    apparent_temperature: data.current.feelsLike,
    humidity: 80, // percentages are 0-100
    wind_speed: 4.2,
    uv_index: 3,
    sunrise: data.current.sunrise,
    sunset: data.current.sunset,
    is_day: data.current.isDay, // strict boolean; drives the day/night icon variant
    // Forecasts (≤ 24 hours, ≤ 8 days kept by Gladys):
    hours: data.hours.map((h) => ({ temperature: h.temp, weather: toCondition(h), datetime: h.time })),
    days: data.days.map((d) => ({ temperature_min: d.min, temperature_max: d.max, datetime: d.date })),
    // CAP-style alerts (≤ 10; Météo France vigilance: yellow → moderate, orange → severe, red → extreme):
    alerts: [
      { severity: WEATHER_ALERT_SEVERITIES.SEVERE, event: 'Orages violents', type: WEATHER_ALERT_TYPES.THUNDERSTORM },
    ],
  };
});
```

The contract, point by point:

- **`units` is the requesting user's preference** — `'metric'` (°C, m/s, hPa, mm, km) or `'us'` (°F, mph, in,
  mi): return values in that unit system. Percentages (`humidity`, `cloud_cover`, `precipitation_probability`)
  are always 0-100, never fractional.
- **`weather` is a condition of the pivot enum** (`WEATHER_CONDITIONS`): `clear` | `partly-cloudy` | `cloud` |
  `fog` | `drizzle` | `rain` | `pouring` | `sleet` | `hail` | `snow` | `thunderstorm` | `wind` | `night` |
  `unknown` — map your provider's codes to it; anything else is coerced to `unknown` by the core (neutral icon).
- **`is_day` carries the day/night signal** (optional strict boolean on the current conditions and each `hours`
  entry — anything else is dropped, never coerced; absent → rendered as day): `weather` keeps the meteorology,
  `is_day` drives the day/night rendering variant. The `night` condition stays accepted for compatibility but is
  **deprecated for providers** — a rainy night is `weather: 'rain', is_day: false`, not `'night'`.
- **Alerts can carry a phenomenon `type`** (`WEATHER_ALERT_TYPES`): `wind` | `rain` | `flood` | `thunderstorm` |
  `snow` | `heat` | `cold` | `avalanche` | `coastal` | `fog` — so the core can translate and iconify the alert
  where the free-text `event` cannot. Optional metadata: an invalid `type` is dropped by the core, the alert is
  kept and rendered from its `event` text alone.
- **The ack is awaited under 15 s** (not the standard 5 s), so a fresh third-party API call fits. Throwing —
  provider not configured, API down — acks the command as failed, and the Gladys provider loop falls through to
  the next available provider.
- **The payload is normalized and bounded by the core**: unknown fields are dropped, numbers must be finite,
  dates must parse, arrays are capped (24 `hours`, 8 `days`, 10 `alerts`, 3 `images`), alert strings are
  truncated (`event` ≤ 100 characters, `description` ≤ 5000 — CAP descriptions run long). `days` may or may not
  include the current day — consumers filter by calendar date, a provider never has to lead with today.

Two optional extensions complete the type:

- **Provider images** (vigilance map, rain radar, satellite view…) — the payload only ever declares **metadata**:
  `images` (≤ 3 entries of `{ key, label? }`, `key` matching `^[a-z0-9][a-z0-9-]{0,31}$`, `label` a
  multi-language object with values ≤ 50 characters). The bytes travel **on demand** through `onWeatherGetImage`:
  resolve the RAW base64 (no `data:` URI prefix) of a PNG or JPEG of at most 500 KB decoded — the core checks the
  magic numbers and the size, caches the validated image 10 minutes per key, and serves it to the browser from
  its own origin (the browser never loads a third-party URL).

  ```js
  gladys.onWeatherGetImage(async (key) => {
    const png = await fetchVigilanceMap(); // your provider code, returns a Buffer
    return png.toString('base64');
  });
  ```

- **The freshness nudge** — Gladys evaluates its weather-alert scene triggers on a 30-minute scheduled check
  (pulled through `onWeatherGet`, diffed on the normalized alerts). A provider that KNOWS something changed
  upstream can do better — never by pushing data: `requestWeatherRefresh()` only means "re-pull me now". The
  data re-enters through the audited `onWeatherGet` path; the nudge itself carries nothing (fire-and-forget,
  rate-limited core-side to 1/min per integration, silently dropped beyond). The Météo France pattern: poll the
  vigilance upstream, nudge on change — the scene fires seconds later instead of within 30 minutes.

  ```js
  onUpstreamVigilanceChange(() => gladys.requestWeatherRefresh());
  ```

Requires a Gladys with weather-integrations support (check the `gladys_version` range of your manifest).

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

**Motorized (PTZ) cameras** add ordinary command features to the same device — no new plumbing, movement commands
arrive through `onSetValue` like any feature. `CAMERA.MOVE` is one feature for all movements: the value names the
movement (0 stop — always supported, never listed as an option —, 1 pan left, 2 pan right, 3 tilt up, 4 tilt down,
5 zoom in, 6 zoom out), and the feature's `supported_options` (`[{ value, label, sort_order }]`) declare the subset
this camera actually supports. **Safety rule (MUST)**: bound every continuous move with a watchdog (~5 s) — a lost
stop must never leave the camera rotating against its mechanical stop; prefer a relative step when the camera
supports one. `CAMERA.PRESET` recalls a saved position: the labeled preset list lives in `supported_options` (the
value sent is the option's integer, mapped by the integration to its protocol token), and on re-publish of an
already-created device the options are silently upserted like the `params` — e.g. a preset renamed on the camera.
The optional `pan-position`/`tilt-position`/`zoom-position` types cover cameras that report an absolute position
(numeric read/write, bounds via `min`/`max`, units integration-defined).

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

Each entry of `container.ports` mirrors the manifest declaration plus the host port Gladys allocated:

```js
// [{ container_port: 5000, protocol: 'tcp', host_port: 42115, label: { en: 'Frigate UI' },
//    name: 'frigate_ui', browsable: true }]
const [{ host_port: frigatePort }] = frigate.ports;
```

The host port is **chosen by Gladys** (a free port, persisted across recreations — never declared in the manifest),
so read it here rather than assuming one; it is `null` as long as none has been assigned (the container has never
started). `browsable` mirrors the manifest field: `true` (default) for a port serving a web UI — the supervision
screen shows an "Open <label>" link — and `false` for a port a browser cannot open, e.g. a WebSocket endpoint
waiting for devices (the OCPP case), which is shown as a plain `<label> : <host_port>` badge instead.

`name` mirrors the optional manifest field of the same port (`[a-z0-9_]{2,20}`, **unique across the whole
manifest**, `null` when the manifest declares none): it is what makes the assigned host port referenceable by the
`{{port:<name>}}` placeholder of the manifest section texts — the way to spell out an address of the instance
inside a sentence shown to the user (see
[Placeholders in section texts](#placeholders-in-section-texts-gladys_host-and-portname)). It pairs naturally with
`browsable: false`: a port that opens no web UI, whose number the user still has to read.

### Mediated network discovery

Integration containers run on a bridge network: LAN **broadcast, mDNS and SSDP traffic never reaches them**, and a
broadcast **emitted** from the container does not cross the NAT to the LAN either (only unicast does, in both
directions). Local discovery (Tuya-style UDP announcements, TP-Link Kasa query/response, Hue mDNS…) therefore goes
through the core, which runs on the host network: **the core captures and emits (network position), the integration
interprets and forges (protocol knowledge)** — the core never parses nor fabricates a payload.

Declare what may be captured in the manifest `network_discovery` field (shown to the user on the install screen,
like `containers` and hardware classes — undeclared captures are rejected with a 403):

```json
"network_discovery": [
  { "type": "udp-broadcast", "ports": [6666, 6667, 7000] },
  { "type": "udp-active-broadcast", "ports": [9999, 20002] },
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

Some protocols are query/response instead of announcement-based: the devices only answer a discovery request, in
unicast **towards the emitter** — so only the core (host network) can play that role. That is the
`udp-active-broadcast` type (TP-Link Kasa style): the integration forges the request (the protocol crypto stays in
the container), the core broadcasts it on a declared port and relays the raw unicast replies:

```js
gladys.onScanRequest(async () => {
  // TP-Link Kasa style: broadcast an encrypted discovery request, the devices answer in unicast.
  const replies = await gladys.scanNetwork('udp-active-broadcast', {
    port: 9999,
    payload: encryptKasaDiscoveryRequest(), // your protocol code, returns a Buffer (≤ 512 bytes)
    timeoutSeconds: 5,
  });
  const devices = replies.map(({ source_ip, payload_base64 }) => {
    const info = decryptKasaReply(Buffer.from(payload_base64, 'base64')); // your protocol code
    const ids = gladys.externalIds('plug', info.deviceId);
    return {
      name: info.alias,
      external_id: ids.device,
      params: [{ name: 'IP_ADDRESS', value: source_ip }],
      features: [],
    };
  });
  await gladys.publishDiscoveredDevices(devices);
});
```

Active-scan guardrails (enforced by the core, the primitive stays uninteresting to hijack): **broadcast only**
(never a unicast towards a chosen target — no LAN sweep by proxy), destination port among the manifest-declared
ports, payload of at most **512 decoded bytes**, **1 scan per 10 seconds** per integration (`429` otherwise).

Raw result shapes: `udp-broadcast` and `udp-active-broadcast` → `[{ source_ip, source_port, payload_base64 }]` (one
entry per received datagram), `mdns` → `[{ name, host, addresses, port, txt }]`, `ssdp` → the raw headers per
responder. Scans are synchronous and bounded (`timeoutSeconds` 1–30); requires a Gladys with mediated-discovery
support (check the `gladys_version` range of your manifest).

### Wake-on-LAN

Same network position problem, emission side: a magic packet is a UDP broadcast, which never crosses the bridge to
the LAN. Declare `network_wake: true` in the manifest (shown on the install screen, like the other authorization
contracts — an undeclared access is a 403) and ask the core to emit it:

```js
await gladys.wakeOnLan('64:e4:d5:b4:12:66'); // ':', '-' and bare formats accepted
// The device ignores the limited broadcast? Target the subnet broadcast, or tune the port:
await gladys.wakeOnLan('64:e4:d5:b4:12:66', { address: '192.168.1.255', port: 9 });
```

The core always builds the standard fixed 102-byte magic packet itself (6 × `0xFF` + the MAC repeated 16 times):
the integration never provides the payload, so the endpoint is not a general UDP proxy. Rate: **1 wake per
2 seconds** per integration (`429` otherwise) — enough for the usual "retry until the device answers" loop. A
resolved call means the packet was **emitted**, not that the device actually woke up: poll the device to confirm
(and keep the usual retry loop, Wake-on-LAN is fire-and-forget by nature).

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
