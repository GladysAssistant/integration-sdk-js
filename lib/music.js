/**
 * Music players (contract capabilities/music.md): the pure helpers behind
 * `publishNowPlaying`, `artworkKey` and the on-demand catalog handlers —
 * the artwork key derivation, the validation of a `nowPlaying` snapshot,
 * the diff that turns it into the states to publish, and a validator that
 * reports, integration-side, what the Gladys core would drop or truncate in
 * a list of `MediaItem`s. The SDK runs that validator in dev mode
 * (DEBUG=gladys-integration-sdk) on every browse, search and queue answer
 * the handlers resolve; `validateMediaItems` is also exported so an
 * integration can assert its catalog in its own tests.
 *
 * The rules mirror `externalIntegration.normalizeMusic.js` of the Gladys
 * core; keep them in sync when the contract grows (additive only).
 */

const { createHash } = require('crypto');

const {
  MUSIC_PLAYBACK_STATE,
  MUSIC_REPEAT_MODE,
  MUSIC_MEDIA_TYPES,
  MAX_MUSIC_TEXT_LENGTH,
  MUSIC_ARTWORK_KEY_REGEX,
  MAX_MUSIC_ITEMS_PER_RESPONSE,
  MAX_MUSIC_MEDIA_ID_LENGTH,
  MAX_MUSIC_ITEM_TEXT_LENGTH,
  MUSIC_POSITION_SEEK_TOLERANCE_SECONDS,
  MUSIC_ARTWORK_KEY_PREFIX,
  MUSIC_ARTWORK_KEY_HASH_LENGTH,
} = require('./constants');
const { DEVICE_FEATURE_TYPES } = require('./device-constants');

const { MUSIC } = DEVICE_FEATURE_TYPES;

const MEDIA_TYPES = Object.values(MUSIC_MEDIA_TYPES);
const PLAYBACK_STATES = Object.values(MUSIC_PLAYBACK_STATE);
const REPEAT_MODES = Object.values(MUSIC_REPEAT_MODE);
const MEDIA_ITEM_FIELDS = ['id', 'type', 'title', 'subtitle', 'duration', 'artwork_key', 'browsable', 'playable'];

// The `music` types whose state is a string (`text` on POST /state).
const MUSIC_STRING_FEATURE_TYPES = [MUSIC.TITLE, MUSIC.ARTIST, MUSIC.ALBUM, MUSIC.ARTWORK];

// The keys of a `nowPlaying` snapshot and the feature type each one feeds.
const NOW_PLAYING_KEYS = {
  playback_state: MUSIC.PLAYBACK_STATE,
  title: MUSIC.TITLE,
  artist: MUSIC.ARTIST,
  album: MUSIC.ALBUM,
  artwork_url: MUSIC.ARTWORK,
  duration: MUSIC.DURATION,
  position: MUSIC.POSITION,
  shuffle: MUSIC.SHUFFLE,
  repeat: MUSIC.REPEAT,
  mute: MUSIC.MUTE,
  volume: MUSIC.VOLUME,
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @description Deterministic artwork key of a source URL: `art-` + the first
 * 12 hex characters of a SHA-1 of the URL. Two tracks of one album share one
 * key, one command, one cache entry; a new image is a new URL, hence a new
 * key — the core caches the bytes one hour by key.
 * @param {string} url - The source URL of the image (any non-empty string the integration can resolve).
 * @returns {string} The artwork key, matching `^[a-z0-9][a-z0-9-]{0,63}$`.
 * @example
 * artworkKey('https://i.scdn.co/image/ab67616d00001e02'); // 'art-3f9a2c1b7e4d'
 */
function artworkKey(url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('artworkKey: "url" must be a non-empty string (the source URL of the image)');
  }
  return `${MUSIC_ARTWORK_KEY_PREFIX}${createHash('sha1').update(url).digest('hex').slice(0, MUSIC_ARTWORK_KEY_HASH_LENGTH)}`;
}

/**
 * @description Read a 0/1 value given as a boolean or as a number.
 * @param {any} value - The raw value.
 * @returns {number|null} 0 or 1, null when invalid.
 * @example
 * toBinary(true); // 1
 */
function toBinary(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value === 0 || value === 1 ? value : null;
}

/**
 * @description Validate a `nowPlaying` snapshot and turn it into the values
 * to publish, keyed by feature type: the enums checked, the texts truncated
 * at 200 characters like the core does, the booleans mapped to 0/1, the
 * seconds rounded, the `artwork_url` turned into its key (`null` → an empty
 * `artwork`, "nothing loaded"). An absent key means "unchanged" and is left
 * out.
 * @param {object} nowPlaying - The snapshot given to publishNowPlaying.
 * @param {Function} toArtworkKey - `(url) => key`, the recording artworkKey of the client.
 * @returns {object} The values by feature type.
 * @example
 * normalizeNowPlaying({ playback_state: 1, title: 'Blue in Green' }, (url) => gladys.artworkKey(url));
 */
function normalizeNowPlaying(nowPlaying, toArtworkKey) {
  if (!isPlainObject(nowPlaying)) {
    throw new Error('publishNowPlaying: "nowPlaying" must be an object');
  }
  const unknown = Object.keys(nowPlaying).filter((key) => NOW_PLAYING_KEYS[key] === undefined);
  if (unknown.length > 0) {
    throw new Error(
      `publishNowPlaying: unknown key "${unknown[0]}" (accepted: ${Object.keys(NOW_PLAYING_KEYS).join(', ')})`,
    );
  }
  const values = {};
  Object.entries(nowPlaying).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    const type = NOW_PLAYING_KEYS[key];
    const path = `publishNowPlaying: "nowPlaying.${key}"`;
    switch (key) {
      case 'playback_state':
        if (!PLAYBACK_STATES.includes(value)) {
          throw new Error(`${path} must be one of MUSIC_PLAYBACK_STATE (${PLAYBACK_STATES.join(', ')})`);
        }
        values[type] = value;
        break;
      case 'title':
      case 'artist':
      case 'album':
        if (typeof value !== 'string') {
          throw new Error(`${path} must be a string (empty when nothing is loaded)`);
        }
        values[type] = value.slice(0, MAX_MUSIC_TEXT_LENGTH);
        break;
      case 'artwork_url':
        if (value !== null && (typeof value !== 'string' || value.length === 0)) {
          throw new Error(`${path} must be a non-empty string, or null when there is no artwork`);
        }
        values[type] = value === null ? '' : toArtworkKey(value);
        break;
      case 'duration':
      case 'position':
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new Error(`${path} must be a finite number of seconds >= 0`);
        }
        values[type] = Math.round(value);
        break;
      case 'shuffle':
      case 'mute':
        if (toBinary(value) === null) {
          throw new Error(`${path} must be a boolean (or 0/1)`);
        }
        values[type] = toBinary(value);
        break;
      case 'repeat':
        if (!REPEAT_MODES.includes(value)) {
          throw new Error(`${path} must be one of MUSIC_REPEAT_MODE (${REPEAT_MODES.join(', ')})`);
        }
        values[type] = value;
        break;
      default:
        // volume
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
          throw new Error(`${path} must be a number between 0 and 100`);
        }
        values[type] = value;
    }
  });
  return values;
}

/**
 * @description The position Gladys shows right now for a player, extrapolated
 * from the last published sample the way the dashboard does: it moves while
 * the published playback state is PLAYING, clamped to the duration when one
 * is known, frozen otherwise.
 * @param {object} snapshot - The last published snapshot `{ values, positionAt }`.
 * @param {number} now - The current time in ms.
 * @returns {number} The extrapolated position in seconds.
 * @example
 * extrapolatePosition({ values: { position: 10, playback_state: 1 }, positionAt: Date.now() - 5000 }, Date.now()); // 15
 */
function extrapolatePosition(snapshot, now) {
  const { values, positionAt } = snapshot;
  if (values[MUSIC.PLAYBACK_STATE] !== MUSIC_PLAYBACK_STATE.PLAYING) {
    return values[MUSIC.POSITION];
  }
  const extrapolated = values[MUSIC.POSITION] + (now - positionAt) / 1000;
  const duration = values[MUSIC.DURATION];
  return duration > 0 ? Math.min(extrapolated, duration) : extrapolated;
}

/**
 * @description Diff the normalized values of a snapshot against the last
 * published one: every changed value is published; the position only when
 * the playback state or the title changes, when it was never published, or
 * when it deviates from the extrapolated one by more than 3 s (a seek) —
 * never otherwise (the dashboard extrapolates it, rule 2 of the contract).
 * @param {object|undefined} previous - The last published snapshot `{ values, positionAt }`, if any.
 * @param {object} values - The normalized values by feature type.
 * @param {number} now - The current time in ms.
 * @returns {object} The changed values by feature type.
 * @example
 * diffNowPlaying(undefined, { playback_state: 1, position: 12 }, Date.now());
 */
function diffNowPlaying(previous, values, now) {
  const changed = {};
  Object.entries(values).forEach(([type, value]) => {
    if (type !== MUSIC.POSITION && (previous === undefined || previous.values[type] !== value)) {
      changed[type] = value;
    }
  });
  if (values[MUSIC.POSITION] !== undefined) {
    const republish =
      previous === undefined ||
      previous.values[MUSIC.POSITION] === undefined ||
      changed[MUSIC.PLAYBACK_STATE] !== undefined ||
      changed[MUSIC.TITLE] !== undefined ||
      Math.abs(values[MUSIC.POSITION] - extrapolatePosition(previous, now)) > MUSIC_POSITION_SEEK_TOLERANCE_SECONDS;
    if (republish) {
      changed[MUSIC.POSITION] = values[MUSIC.POSITION];
    }
  }
  return changed;
}

/**
 * @description Report what the Gladys core would drop or truncate in one
 * MediaItem (`normalizeMediaItem`): an item without a string `id` (1-512
 * characters), without a non-empty string `title` or with a `type` outside
 * MUSIC_MEDIA_TYPES is dropped; texts above 200 characters are truncated;
 * an invalid `duration` is read as null, an invalid `artwork_key` dropped,
 * `browsable`/`playable` read as false unless strictly true; unknown fields
 * are dropped.
 * @param {any} item - The item.
 * @param {string} path - The item path, for the messages.
 * @param {Array<string>} report - The issues collected so far.
 * @example
 * checkMediaItem(item, 'items[0]', report);
 */
function checkMediaItem(item, path, report) {
  if (!isPlainObject(item)) {
    report.push(`${path}: not an object — dropped by Gladys`);
    return;
  }
  if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > MAX_MUSIC_MEDIA_ID_LENGTH) {
    report.push(`${path}.id: must be a string of 1-${MAX_MUSIC_MEDIA_ID_LENGTH} characters — item dropped by Gladys`);
  }
  if (typeof item.title !== 'string' || item.title.length === 0) {
    report.push(`${path}.title: must be a non-empty string — item dropped by Gladys`);
  } else if (item.title.length > MAX_MUSIC_ITEM_TEXT_LENGTH) {
    report.push(`${path}.title: ${item.title.length} characters, truncated at ${MAX_MUSIC_ITEM_TEXT_LENGTH}`);
  }
  if (!MEDIA_TYPES.includes(item.type)) {
    report.push(`${path}.type: must be one of ${MEDIA_TYPES.join(', ')} — item dropped by Gladys`);
  }
  if (item.subtitle !== undefined && item.subtitle !== null) {
    if (typeof item.subtitle !== 'string') {
      report.push(`${path}.subtitle: must be a string — dropped by Gladys`);
    } else if (item.subtitle.length > MAX_MUSIC_ITEM_TEXT_LENGTH) {
      report.push(`${path}.subtitle: ${item.subtitle.length} characters, truncated at ${MAX_MUSIC_ITEM_TEXT_LENGTH}`);
    }
  }
  if (
    item.duration !== undefined &&
    item.duration !== null &&
    (!Number.isInteger(item.duration) || item.duration < 0)
  ) {
    report.push(`${path}.duration: must be an integer number of seconds >= 0 (or null) — read as null by Gladys`);
  }
  if (
    item.artwork_key !== undefined &&
    item.artwork_key !== null &&
    (typeof item.artwork_key !== 'string' || !MUSIC_ARTWORK_KEY_REGEX.test(item.artwork_key))
  ) {
    report.push(`${path}.artwork_key: must match ${MUSIC_ARTWORK_KEY_REGEX} (see artworkKey) — dropped by Gladys`);
  }
  ['browsable', 'playable'].forEach((flag) => {
    if (item[flag] !== undefined && typeof item[flag] !== 'boolean') {
      report.push(`${path}.${flag}: must be a boolean — read as false by Gladys`);
    }
  });
  Object.keys(item).forEach((field) => {
    if (!MEDIA_ITEM_FIELDS.includes(field)) {
      report.push(`${path}.${field}: unknown field, dropped by Gladys`);
    }
  });
}

/**
 * @description Report what the Gladys core would drop or truncate in the
 * `items` of a browse, search or queue answer (contract
 * capabilities/music.md, section 4.2): one message per issue, an empty array
 * when the list goes through unchanged. Run by the SDK in dev mode on every
 * resolved answer; exported so an integration can assert its catalog in its
 * own tests.
 * @param {any} items - The items of the answer.
 * @returns {Array<string>} The issues, in reading order.
 * @example
 * assert.deepEqual(validateMediaItems(await browse(null)), []);
 */
function validateMediaItems(items) {
  const report = [];
  if (!Array.isArray(items)) {
    return ['items: must be an array of MediaItems — read as empty by Gladys'];
  }
  if (items.length > MAX_MUSIC_ITEMS_PER_RESPONSE) {
    report.push(`items: ${items.length} items, ${MAX_MUSIC_ITEMS_PER_RESPONSE} allowed — the others are dropped`);
  }
  items
    .slice(0, MAX_MUSIC_ITEMS_PER_RESPONSE)
    .forEach((item, index) => checkMediaItem(item, `items[${index}]`, report));
  return report;
}

module.exports = {
  MUSIC_STRING_FEATURE_TYPES,
  NOW_PLAYING_KEYS,
  artworkKey,
  normalizeNowPlaying,
  extrapolatePosition,
  diffNowPlaying,
  validateMediaItems,
};
