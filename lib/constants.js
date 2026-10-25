/**
 * Contract constants — mirror of the Gladys host API / WebSocket protocol
 * specification (sections C.2–C.4). The SDK depends only on these contracts,
 * never on Gladys code.
 */

const API_PREFIX = '/api/integration/v1';

const WEBSOCKET_MESSAGE_TYPES = {
  AUTHENTICATE: {
    INTEGRATION_REQUEST: 'authenticate.integration-request',
  },
  AUTHENTICATION: {
    CONNECTED: 'authentication.connected',
  },
  EXTERNAL_INTEGRATION: {
    DEVICE_SET_VALUE: 'external-integration.device.set-value',
    DEVICE_POLL: 'external-integration.device.poll',
    COMMAND_RESULT: 'external-integration.command-result',
    SCAN_REQUEST: 'external-integration.scan-request',
    DEVICE_CREATED: 'external-integration.device-created',
    DEVICE_UPDATED: 'external-integration.device-updated',
    DEVICE_DELETED: 'external-integration.device-deleted',
    CONFIG_UPDATED: 'external-integration.config-updated',
    HARDWARE_UPDATED: 'external-integration.hardware-updated',
    OAUTH_GET_AUTHORIZE_URL: 'external-integration.oauth.get-authorize-url',
    OAUTH_CALLBACK: 'external-integration.oauth.callback',
    ACTION_RUN: 'external-integration.action.run',
    AI_CHAT: 'external-integration.ai.chat',
    CAMERA_GET_IMAGE: 'external-integration.camera.get-image',
    WEATHER_GET: 'external-integration.weather.get',
    WEATHER_GET_IMAGE: 'external-integration.weather.get-image',
    WEATHER_REFRESH: 'external-integration.weather.refresh',
    TTS_SYNTHESIZE: 'external-integration.tts.synthesize',
    MESSAGE_SEND: 'external-integration.message.send',
    WEBHOOK_RECEIVED: 'external-integration.webhook.received',
    WEBHOOK_REQUEST: 'external-integration.webhook.request',
    WEBHOOK_UPDATED: 'external-integration.webhook-updated',
    CALENDAR_ACCOUNT_UPDATED: 'external-integration.calendar.account-updated',
    SCENE_ACTION_RUN: 'external-integration.scene-action.run',
    WIDGET_GET: 'external-integration.widget.get',
    WIDGET_GET_IMAGE: 'external-integration.widget.get-image',
    WIDGET_ACTION: 'external-integration.widget.action',
    WIDGET_REFRESH: 'external-integration.widget.refresh',
    ENERGY_CONTRACT_PRICE: 'external-integration.energy-contract.price',
    ENERGY_CONTRACT_CURRENT: 'external-integration.energy-contract.current',
    ENERGY_CALENDAR_REFRESH: 'external-integration.energy-calendar.refresh',
    // music players: on-demand catalog, queue and artwork (capabilities/music.md)
    MUSIC_BROWSE: 'external-integration.music.browse',
    MUSIC_SEARCH: 'external-integration.music.search',
    MUSIC_PLAY: 'external-integration.music.play',
    MUSIC_QUEUE_GET: 'external-integration.music.queue-get',
    MUSIC_QUEUE_PLAY: 'external-integration.music.queue-play',
    MUSIC_GET_ARTWORK: 'external-integration.music.get-artwork',
    HEARTBEAT: 'external-integration.heartbeat',
  },
};

// Close code sent by Gladys when the integration token is refused.
const INVALID_ACCESS_TOKEN_CLOSE_CODE = 4000;

// POST /state accepts at most 100 states per request (contract C.3).
const MAX_STATES_PER_REQUEST = 100;

// POST /device/transport accepts at most 100 entries per request (contract C.3).
const MAX_TRANSPORTS_PER_REQUEST = 100;

// Each language of the degraded transport message (GLADYS_TRANSPORT_MESSAGE)
// is bounded to 200 characters by the Gladys core (contract C.3).
const MAX_TRANSPORT_MESSAGE_LENGTH = 200;

// POST /camera/image accepts images up to 150 KB, the bound of the Gladys core
// (contract C.3) — measured on the full `image/jpg;base64,...` string.
const MAX_CAMERA_IMAGE_SIZE = 150 * 1024;

// POST /message accepts texts of 1-4096 characters, the bound of the Gladys
// core (contract B.15).
const MAX_MESSAGE_TEXT_LENGTH = 4096;

// POST /network_discovery/scan accepts an active-broadcast payload of at most
// 512 decoded bytes, the bound of the Gladys core (contract B.16).
const MAX_ACTIVE_SCAN_PAYLOAD_SIZE = 512;

// The body of a sync webhook response is bounded to 64 KB by the Gladys core
// (contract B.17) — it travels back through Gladys Plus to the caller.
const MAX_WEBHOOK_SYNC_BODY_SIZE = 64 * 1024;

// POST /scene/event accepts a flat `data` object of at most 30 keys, one
// primitive per key (string of at most 1000 characters, finite number,
// boolean or null) — the bounds of the Gladys core (contract "scene
// triggers and actions"). Rate-limited core-side to 300 events per minute
// per integration (429 beyond), a counter separate from the states'.
const MAX_SCENE_EVENT_DATA_KEYS = 30;
const MAX_SCENE_EVENT_STRING_LENGTH = 1000;

// Calendar integrations (contract capabilities/calendar-type.md): the
// normalization bounds of the calendar host endpoints, mirrored from the
// Gladys core so a refused payload never leaves the integration. Every
// calendar and event external_id carries the user-scoped prefix
// `ext:<selector>:<user_selector>:` (globally unique columns core-side).
// Writes (POST/DELETE) are rate-limited core-side to 30 per minute per
// integration (429 beyond).
const MAX_CALENDARS_PER_USER = 50;
const MAX_CALENDAR_EVENTS_PER_REQUEST = 500;
const MAX_CALENDAR_NAME_LENGTH = 100;
const MAX_CALENDAR_DESCRIPTION_LENGTH = 500;
const MAX_CALENDAR_EVENT_NAME_LENGTH = 200;
const MAX_CALENDAR_EVENT_LOCATION_LENGTH = 500;
const MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH = 1000;
const MAX_CALENDAR_EVENT_URL_LENGTH = 500;
const MAX_CALENDAR_EXTERNAL_ID_LENGTH = 255;

// Energy contracts capability (contract capabilities/energy-contracts.md):
// POST /energy/calendar accepts at most 2,000 entries per call (20 days of a
// 15-minute calendar) in a calendar key declared in the manifest
// (`^[a-z0-9][a-z0-9-]{0,63}$`, 403 otherwise); the delegated pricing
// request carries at most 1,488 half-hour intervals (31 days).
const MAX_ENERGY_CALENDAR_ENTRIES_PER_REQUEST = 2000;
const ENERGY_CALENDAR_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
// POST /energy/consumption (contract host-api-endpoints.md): the dated
// consumption of a supplier whose readings arrive after the fact, at most
// 2,000 intervals per call — the same batch size as a calendar publication.
const MAX_ENERGY_CONSUMPTION_INTERVALS_PER_REQUEST = 2000;

// AI provider integrations (manifest `type: "ai"`, contract
// capabilities/ai-type.md): the `purpose` hint of a relayed chat completion
// request — a smart adapter picks a cheap model for the intent router and a
// strong one for the chat. The core bounds the completion before it enters
// the tool-calling loop: only `choices[0].message` is kept, `content` a
// string of at most 50,000 characters (or null), at most 20 `tool_calls` of
// `{ id, type: "function", function: { name, arguments } }` with a name
// matching ^[a-zA-Z0-9_-]{1,64}$ and arguments a string of at most 100,000
// characters — anything else fails the whole completion
// (EXTERNAL_INTEGRATION_INVALID_AI_RESPONSE, never a silent empty turn).
const AI_CHAT_PURPOSES = {
  CHAT: 'chat',
  INTENT_CLASSIFICATION: 'intent-classification',
  WEEKLY_DIGEST: 'weekly-digest',
};
const MAX_AI_CHAT_CONTENT_CHARS = 50 * 1000;
const MAX_AI_CHAT_TOOL_CALLS = 20;
const MAX_AI_CHAT_TOOL_ARGUMENTS_CHARS = 100 * 1000;
const AI_CHAT_TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// TTS provider integrations (manifest `type: "tts"`, contract
// capabilities/tts-type.md): the audio of a synthesized clip travels back as
// a `<content type>;base64,<payload>` string (the camera convention, the
// `data:` scheme accepted too) whose content type is one of these — what
// Sonos, Cast and browsers actually play, the served URL extension derived
// from it — and whose decoded size is at most 5 MB; the text is capped at
// 2,000 characters by the core BEFORE the relay (truncation, not an error).
const TTS_AUDIO_CONTENT_TYPES = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
};
const MAX_TTS_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_TTS_TEXT_LENGTH = 2000;

// Music players (contract capabilities/music.md): the enums of the `music`
// features — `playback_state` (PAUSED/PLAYING predate the two others;
// IDLE = nothing loaded or stopped, BUFFERING is reported only: writing 0/1/2
// pauses/plays/stops), `repeat` — and of the on-demand catalog: the
// `MediaItem` types (never a vendor label) and the play modes (`replace` for
// every integration, `next`/`append` for the ones declaring `music.append`).
const MUSIC_PLAYBACK_STATE = {
  PLAYING: 1,
  PAUSED: 0,
  IDLE: 2,
  BUFFERING: 3,
};
const MUSIC_REPEAT_MODE = {
  OFF: 0,
  ALL: 1,
  ONE: 2,
};
const MUSIC_MEDIA_TYPES = {
  TRACK: 'track',
  ALBUM: 'album',
  ARTIST: 'artist',
  PLAYLIST: 'playlist',
  RADIO: 'radio',
  FOLDER: 'folder',
};
const MUSIC_PLAY_MODES = {
  REPLACE: 'replace',
  NEXT: 'next',
  APPEND: 'append',
};
// A title, an artist or an album state is truncated at this length by the
// core; an `artwork` state is an image KEY served by the integration (the
// artwork proxy), never a URL — the empty string meaning "none".
const MAX_MUSIC_TEXT_LENGTH = 200;
const MUSIC_ARTWORK_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Bounds of the MediaItems of a browse, search or queue answer: at most 100
// items per response, an `id` of at most 512 characters (opaque, owned by
// the integration), texts truncated at 200 characters — an item without id
// or title, or with a type outside MUSIC_MEDIA_TYPES, is dropped by the core.
const MAX_MUSIC_ITEMS_PER_RESPONSE = 100;
const MAX_MUSIC_MEDIA_ID_LENGTH = 512;
const MAX_MUSIC_ITEM_TEXT_LENGTH = 200;
// publishNowPlaying republishes the position when the reported one deviates
// from the extrapolated one by more than this many seconds (a seek).
const MUSIC_POSITION_SEEK_TOLERANCE_SECONDS = 3;
// Artwork keys derived from a source URL: `art-` + 12 hex of a SHA-1.
const MUSIC_ARTWORK_KEY_PREFIX = 'art-';
const MUSIC_ARTWORK_KEY_HASH_LENGTH = 12;
// The default artwork handler fetches the recorded URL under this delay,
// inside the 15 s ack of music.get-artwork.
const DEFAULT_ARTWORK_FETCH_TIMEOUT = 10 * 1000;
// The URLs remembered by artworkKey (the most recent ones are kept).
const MAX_REMEMBERED_ARTWORK_URLS = 1000;

// Values of the per-device transport status, stored in the reserved
// GLADYS_TRANSPORT device param and rendered as a badge in the Gladys UI
// (contract C.3).
const DEVICE_TRANSPORTS = {
  LOCAL: 'local',
  CLOUD: 'cloud',
  UNREACHABLE: 'unreachable',
};

// Condition enum of the pivot weather format (contract B.18): anything else
// is coerced to 'unknown' by the Gladys core (the widget renders a neutral
// icon). Extending the enum is a core-side, additive evolution — never send
// a value that is not listed here. NIGHT is deprecated for providers: send
// the real condition plus is_day: false instead (a rainy night stays RAIN).
const WEATHER_CONDITIONS = {
  CLEAR: 'clear',
  PARTLY_CLOUDY: 'partly-cloudy',
  CLOUD: 'cloud',
  FOG: 'fog',
  DRIZZLE: 'drizzle',
  RAIN: 'rain',
  POURING: 'pouring',
  SLEET: 'sleet',
  HAIL: 'hail',
  SNOW: 'snow',
  THUNDERSTORM: 'thunderstorm',
  WIND: 'wind',
  NIGHT: 'night',
  UNKNOWN: 'unknown',
  // Extensions: phenomena several providers distinguish but the original enum
  // flattened into a neighbour. They stay GENERIC -- each is encoded
  // separately by Meteo France, OpenWeather and the NWS alike, never one
  // provider's private code. Sending the broader condition stays valid, so a
  // provider that cannot tell them apart needs no change.
  FREEZING_RAIN: 'freezing-rain',
  FREEZING_FOG: 'freezing-fog',
  SNOW_THUNDERSTORM: 'snow-thunderstorm',
  SANDSTORM: 'sandstorm',
  TORNADO: 'tornado',
  HURRICANE: 'hurricane',
};

// CAP-style severities (Common Alerting Protocol) of the weather alerts
// (contract B.18) — generic, never one provider's scale (Météo France
// vigilance: yellow → moderate, orange → severe, red → extreme). An alert
// with any other severity is dropped by the Gladys core.
const WEATHER_ALERT_SEVERITIES = {
  MINOR: 'minor',
  MODERATE: 'moderate',
  SEVERE: 'severe',
  EXTREME: 'extreme',
};

// Phenomenon types of the weather alerts (contract B.18), generalized from
// the Météo France vigilance phenomena, the MeteoAlarm awareness types and
// the NWS event catalog. Optional metadata: an invalid type is dropped by
// the Gladys core, the alert is kept and rendered from its event text alone.
const WEATHER_ALERT_TYPES = {
  WIND: 'wind',
  RAIN: 'rain',
  FLOOD: 'flood',
  THUNDERSTORM: 'thunderstorm',
  SNOW: 'snow',
  HEAT: 'heat',
  COLD: 'cold',
  AVALANCHE: 'avalanche',
  COASTAL: 'coastal',
  FOG: 'fog',
};

// Bounds of the pivot weather format (contract B.18): the Gladys core caps
// the arrays and truncates the alert strings past these limits — anything
// beyond is silently dropped, so there is no point returning more.
const MAX_WEATHER_HOURS = 24;
const MAX_WEATHER_DAYS = 8;
const MAX_WEATHER_ALERTS = 10;
const MAX_WEATHER_ALERT_EVENT_LENGTH = 100;
// CAP descriptions run long (NWS bulletins regularly exceed 2000 chars,
// the Météo France vigilance bulletin runs up to ~4000).
const MAX_WEATHER_ALERT_DESCRIPTION_LENGTH = 5000;
// Provider images (contract B.18): declared as metadata in the pivot
// payload (`images`, ≤ 3 entries of `{ key, label? }`), bytes fetched on
// demand over weather.get-image — raw base64 of a PNG or JPEG, at most
// 500 KB decoded (magic numbers and size checked by the Gladys core).
const MAX_WEATHER_IMAGES = 3;
const MAX_WEATHER_IMAGE_LABEL_LENGTH = 50;
const MAX_WEATHER_IMAGE_BYTES = 500 * 1024;

// Reconnection backoff: min(base * 2^attempt, max) (contract C.8).
const DEFAULT_RECONNECT_BASE_DELAY = 1000;
const DEFAULT_RECONNECT_MAX_DELAY = 60 * 1000;

// Host API requests are aborted past this delay so a slow or unresponsive
// host can never stall connect()/resynchronization indefinitely.
const DEFAULT_REQUEST_TIMEOUT = 15 * 1000;

module.exports = {
  API_PREFIX,
  WEBSOCKET_MESSAGE_TYPES,
  INVALID_ACCESS_TOKEN_CLOSE_CODE,
  MAX_STATES_PER_REQUEST,
  MAX_TRANSPORTS_PER_REQUEST,
  MAX_TRANSPORT_MESSAGE_LENGTH,
  MAX_CAMERA_IMAGE_SIZE,
  MAX_MESSAGE_TEXT_LENGTH,
  MAX_ACTIVE_SCAN_PAYLOAD_SIZE,
  MAX_WEBHOOK_SYNC_BODY_SIZE,
  MAX_SCENE_EVENT_DATA_KEYS,
  MAX_SCENE_EVENT_STRING_LENGTH,
  MAX_CALENDARS_PER_USER,
  MAX_CALENDAR_EVENTS_PER_REQUEST,
  MAX_CALENDAR_NAME_LENGTH,
  MAX_CALENDAR_DESCRIPTION_LENGTH,
  MAX_CALENDAR_EVENT_NAME_LENGTH,
  MAX_CALENDAR_EVENT_LOCATION_LENGTH,
  MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH,
  MAX_CALENDAR_EVENT_URL_LENGTH,
  MAX_CALENDAR_EXTERNAL_ID_LENGTH,
  MAX_ENERGY_CALENDAR_ENTRIES_PER_REQUEST,
  ENERGY_CALENDAR_KEY_REGEX,
  MAX_ENERGY_CONSUMPTION_INTERVALS_PER_REQUEST,
  AI_CHAT_PURPOSES,
  MAX_AI_CHAT_CONTENT_CHARS,
  MAX_AI_CHAT_TOOL_CALLS,
  MAX_AI_CHAT_TOOL_ARGUMENTS_CHARS,
  AI_CHAT_TOOL_NAME_REGEX,
  TTS_AUDIO_CONTENT_TYPES,
  MAX_TTS_AUDIO_SIZE_BYTES,
  MAX_TTS_TEXT_LENGTH,
  MUSIC_PLAYBACK_STATE,
  MUSIC_REPEAT_MODE,
  MUSIC_MEDIA_TYPES,
  MUSIC_PLAY_MODES,
  MAX_MUSIC_TEXT_LENGTH,
  MUSIC_ARTWORK_KEY_REGEX,
  MAX_MUSIC_ITEMS_PER_RESPONSE,
  MAX_MUSIC_MEDIA_ID_LENGTH,
  MAX_MUSIC_ITEM_TEXT_LENGTH,
  MUSIC_POSITION_SEEK_TOLERANCE_SECONDS,
  MUSIC_ARTWORK_KEY_PREFIX,
  MUSIC_ARTWORK_KEY_HASH_LENGTH,
  DEFAULT_ARTWORK_FETCH_TIMEOUT,
  MAX_REMEMBERED_ARTWORK_URLS,
  DEVICE_TRANSPORTS,
  WEATHER_CONDITIONS,
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_TYPES,
  MAX_WEATHER_HOURS,
  MAX_WEATHER_DAYS,
  MAX_WEATHER_ALERTS,
  MAX_WEATHER_ALERT_EVENT_LENGTH,
  MAX_WEATHER_ALERT_DESCRIPTION_LENGTH,
  MAX_WEATHER_IMAGES,
  MAX_WEATHER_IMAGE_LABEL_LENGTH,
  MAX_WEATHER_IMAGE_BYTES,
  DEFAULT_RECONNECT_BASE_DELAY,
  DEFAULT_RECONNECT_MAX_DELAY,
  DEFAULT_REQUEST_TIMEOUT,
};
