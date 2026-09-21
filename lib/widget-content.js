/**
 * Dashboard widgets declared by integrations (contract "dashboard widgets",
 * sections 4–6): the content vocabulary enums, the bounds, and a validator
 * that reports, integration-side, what the Gladys core would drop, truncate
 * or refuse. The core normalizes and bounds every content it receives —
 * silently trimming a card — so the SDK runs this validator in dev mode
 * (DEBUG=gladys-integration-sdk) on every content and image the handlers
 * resolve, and logs the violations: the developer reads "9 components, 8
 * allowed: status dropped" in the integration's own logs instead of staring
 * at a silently trimmed card. `validateWidgetContent` and
 * `validateWidgetImage` are also exported so an integration can assert its
 * widgets in its own tests.
 *
 * The rules mirror `normalizeWidgetContent` / `normalizeWidgetImage` of the
 * Gladys core; keep them in sync when the vocabulary grows (additive only).
 */

// Semantic colors of the vocabulary, mapped by the core to theme colors in
// both modes — never a hex value.
const WIDGET_COLORS = {
  NEUTRAL: 'neutral',
  PRIMARY: 'primary',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
  INFO: 'info',
};

const WIDGET_TEXT_VARIANTS = {
  HEADING: 'heading',
  BODY: 'body',
  CAPTION: 'caption',
};

const WIDGET_CHART_TYPES = {
  LINE: 'line',
  AREA: 'area',
  BAR: 'bar',
  STEPLINE: 'stepline',
};

// History window of a device-bound chart (the chart box's interval enum).
const WIDGET_CHART_INTERVALS = {
  LAST_HOUR: 'last-hour',
  LAST_TWELVE_HOURS: 'last-twelve-hours',
  LAST_DAY: 'last-day',
  LAST_THREE_DAYS: 'last-three-days',
  LAST_WEEK: 'last-week',
  LAST_MONTH: 'last-month',
  LAST_THREE_MONTHS: 'last-three-months',
  LAST_YEAR: 'last-year',
};

const WIDGET_CARD_LIST_DISPLAYS = {
  GRID: 'grid',
  LIST: 'list',
};

const WIDGET_IMAGE_FITS = {
  COVER: 'cover',
  CONTAIN: 'contain',
};

const WIDGET_BUTTON_STYLES = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  DANGER: 'danger',
};

// Bounds of the content envelope and of the images, the Gladys core's.
const SUPPORTED_WIDGET_CONTENT_VERSION = 1;
const MAX_WIDGET_CONTENT_BYTES = 256 * 1024;
const WIDGET_CONTENT_TTL_MIN_SECONDS = 10;
const WIDGET_CONTENT_TTL_MAX_SECONDS = 3600;
const WIDGET_CONTENT_TTL_DEFAULT_SECONDS = 60;
const WIDGET_KEY_REGEX = /^[a-z0-9_]{2,32}$/;
const WIDGET_IMAGE_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const WIDGET_ACTION_KEY_REGEX = /^[a-z0-9_]{2,32}$/;
const WIDGET_ICON_REGEX = /^[a-z0-9-]{1,40}$/;
const MAX_WIDGET_ACTION_PARAMS_BYTES = 1024;
const MAX_WIDGET_URL_LENGTH = 2048;
const MAX_WIDGET_MESSAGE_LENGTH = 200;
const MAX_WIDGET_IMAGE_BYTES = 300 * 1024;
const MAX_WIDGET_IMAGE_DIMENSION = 4096;

// The content budget (section 5): components beyond a cap are dropped in
// content order by the core — the first ones win.
const WIDGET_CONTENT_BUDGET = {
  components: 8,
  focal: 1,
  tiles: 6,
  texts: 2,
  bodyTexts: 1,
  status: 1,
  buttons: 4,
};

// Per-field text bounds, in characters per language value.
const TEXT_BOUNDS = {
  heading: 40,
  caption: 80,
  body: 300,
  tileValue: 12,
  tileLabel: 24,
  unit: 6,
  statusLabel: 40,
  statusValue: 40,
  seriesName: 24,
  chartTitle: 40,
  annotationLabel: 16,
  cardTitle: 60,
  cardSubtitle: 60,
  badgeText: 16,
  cardDescription: 2000,
  linkLabel: 24,
  imageAlt: 100,
  buttonLabel: 24,
};
const MAX_STATUS_ITEMS = 10;
const MAX_CHART_SERIES = 4;
const MAX_CHART_POINTS = 300;
const MAX_CHART_DEVICE_FEATURES = 4;
const MAX_CHART_ANNOTATIONS = 8;
const MAX_CARD_LIST_ITEMS = { grid: 12, list: 8 };
const MAX_CARD_LINKS = 3;
const FOCAL_TYPES = ['chart', 'card-list', 'image'];
const TILE_TYPES = ['value', 'gauge'];
const LANGUAGE_KEY_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isEnum = (value, values) => Object.values(values).includes(value);

/**
 * Collects the violations of one content: `error(path, message)` for what the
 * core drops (the component is lost), `warn(path, message)` for what it
 * silently alters (truncation, clamping, an ignored optional field).
 */
class Report {
  constructor() {
    this.issues = [];
  }

  error(path, message) {
    this.issues.push(`${path}: ${message}`);
  }

  warn(path, message) {
    this.issues.push(`${path}: ${message}`);
  }
}

/**
 * @description Check a text field: a plain string or a multi-language object
 * with an `en` key, every value within the bound. Reports the truncations.
 * @param {any} value - The raw text field.
 * @param {number} maxLength - The bound in characters per language value.
 * @param {string} path - Path of the field, for the report.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps the field.
 * @example
 * checkText({ en: 'Battery' }, 24, 'components[0].label', report);
 */
function checkText(value, maxLength, path, report) {
  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      report.error(path, 'is an empty string');
      return false;
    }
    if (value.trim().length > maxLength) {
      report.warn(path, `is ${value.trim().length} characters long, truncated to ${maxLength} by Gladys`);
    }
    return true;
  }
  if (!isPlainObject(value)) {
    report.error(path, 'must be a string or a multi-language object');
    return false;
  }
  if (typeof value.en !== 'string' || value.en.trim().length === 0) {
    report.error(path, 'must carry a non-empty "en" value (the language fallback)');
    return false;
  }
  Object.keys(value).forEach((language) => {
    if (!LANGUAGE_KEY_REGEX.test(language) || typeof value[language] !== 'string') {
      report.warn(`${path}.${language}`, 'is not a language code with a string value, ignored by Gladys');
    } else if (value[language].trim().length > maxLength) {
      report.warn(
        `${path}.${language}`,
        `is ${value[language].trim().length} characters long, truncated to ${maxLength} by Gladys`,
      );
    }
  });
  return true;
}

/**
 * @description Check an optional text field (absent is fine).
 * @param {object} raw - The raw object.
 * @param {string} field - The field name.
 * @param {number} maxLength - The bound.
 * @param {string} path - Path of the object, for the report.
 * @param {Report} report - The report.
 * @example
 * checkOptionalText(raw, 'label', 24, 'components[0]', report);
 */
function checkOptionalText(raw, field, maxLength, path, report) {
  if (raw[field] !== undefined) {
    checkText(raw[field], maxLength, `${path}.${field}`, report);
  }
}

/**
 * @description Check an optional enum field: an unknown value is replaced by
 * the default (or dropped) by the core, never an error.
 * @param {object} raw - The raw object.
 * @param {string} field - The field name.
 * @param {object} values - The enum.
 * @param {string} path - Path of the object, for the report.
 * @param {Report} report - The report.
 * @example
 * checkOptionalEnum(raw, 'color', WIDGET_COLORS, 'components[0]', report);
 */
function checkOptionalEnum(raw, field, values, path, report) {
  if (raw[field] !== undefined && !isEnum(raw[field], values)) {
    report.warn(`${path}.${field}`, `"${raw[field]}" is not one of ${Object.values(values).join(', ')}, ignored`);
  }
}

/**
 * @description Check an optional icon name (shape only, like the core).
 * @param {object} raw - The raw object.
 * @param {string} path - Path of the object, for the report.
 * @param {Report} report - The report.
 * @example
 * checkOptionalIcon(raw, 'components[0]', report);
 */
function checkOptionalIcon(raw, path, report) {
  if (raw.icon !== undefined && (typeof raw.icon !== 'string' || !WIDGET_ICON_REGEX.test(raw.icon))) {
    report.warn(`${path}.icon`, 'is not a Feather icon name (^[a-z0-9-]{1,40}$), ignored');
  }
}

/**
 * @description Check an ISO 8601 date field.
 * @param {any} value - The raw value.
 * @returns {boolean} True when the core parses it.
 * @example
 * isIsoDate('2026-10-07');
 */
function isIsoDate(value) {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(new Date(value).getTime());
}

/**
 * @description Check an https URL within the length bound, without credentials.
 * @param {any} value - The raw value.
 * @returns {boolean} True when the core keeps it.
 * @example
 * isHttpsUrl('https://www.themoviedb.org/movie/1');
 */
function isHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_WIDGET_URL_LENGTH || !value.startsWith('https://')) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * @description Check a device feature reference: the feature external_id as a
 * plain non-empty string.
 * @param {any} value - The raw value.
 * @returns {boolean} True when the shape is right.
 * @example
 * isDeviceReference('ext:demo:switch:binary');
 */
function isDeviceReference(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * @description Check a `text` component.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkTextComponent({ type: 'text', text: 'Hello' }, 'components[0]', report);
 */
function checkTextComponent(raw, path, report) {
  checkOptionalEnum(raw, 'variant', WIDGET_TEXT_VARIANTS, path, report);
  const variant = isEnum(raw.variant, WIDGET_TEXT_VARIANTS) ? raw.variant : 'body';
  return checkText(raw.text, TEXT_BOUNDS[variant], `${path}.text`, report);
}

/**
 * @description Check a `value` component (a tile).
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkValueComponent({ type: 'value', value: 82, unit: '%' }, 'components[0]', report);
 */
function checkValueComponent(raw, path, report) {
  checkOptionalText(raw, 'label', TEXT_BOUNDS.tileLabel, path, report);
  checkOptionalIcon(raw, path, report);
  checkOptionalEnum(raw, 'color', WIDGET_COLORS, path, report);
  if (raw.device_feature !== undefined) {
    if (!isDeviceReference(raw.device_feature)) {
      report.error(`${path}.device_feature`, 'must be the feature external_id as a plain string');
      return false;
    }
    if (raw.value !== undefined || raw.unit !== undefined) {
      report.warn(path, 'carries both device_feature and value/unit: the live feature wins, value/unit are ignored');
    }
    return true;
  }
  checkOptionalText(raw, 'unit', TEXT_BOUNDS.unit, path, report);
  if (isFiniteNumber(raw.value)) {
    return true;
  }
  if (raw.value === undefined) {
    report.error(`${path}.value`, 'is required (a finite number, a string ≤ 12 characters, or device_feature)');
    return false;
  }
  return checkText(raw.value, TEXT_BOUNDS.tileValue, `${path}.value`, report);
}

/**
 * @description Check a `gauge` component.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkGaugeComponent({ type: 'gauge', value: 42, min: 0, max: 100 }, 'components[0]', report);
 */
function checkGaugeComponent(raw, path, report) {
  checkOptionalText(raw, 'label', TEXT_BOUNDS.tileLabel, path, report);
  checkOptionalEnum(raw, 'color', WIDGET_COLORS, path, report);
  const hasValidRange = isFiniteNumber(raw.min) && isFiniteNumber(raw.max) && raw.min < raw.max;
  if (raw.device_feature !== undefined) {
    if (!isDeviceReference(raw.device_feature)) {
      report.error(`${path}.device_feature`, 'must be the feature external_id as a plain string');
      return false;
    }
    if ((raw.min !== undefined || raw.max !== undefined) && !hasValidRange) {
      report.warn(path, "min/max are not finite numbers with min < max, the feature's own range is used");
    }
    return true;
  }
  checkOptionalText(raw, 'unit', TEXT_BOUNDS.unit, path, report);
  if (!isFiniteNumber(raw.value)) {
    report.error(`${path}.value`, 'is required (a finite number, or device_feature)');
    return false;
  }
  if (!hasValidRange) {
    report.error(path, 'min and max are required, finite, with min < max');
    return false;
  }
  return true;
}

/**
 * @description Check a `status` component.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkStatusComponent({ type: 'status', items: [{ label: 'State', value: 'Docked' }] }, 'components[0]', report);
 */
function checkStatusComponent(raw, path, report) {
  if (!Array.isArray(raw.items)) {
    report.error(`${path}.items`, 'is required (an array of { label, value })');
    return false;
  }
  if (raw.items.length > MAX_STATUS_ITEMS) {
    report.warn(
      `${path}.items`,
      `has ${raw.items.length} rows, ${MAX_STATUS_ITEMS} allowed: the extra rows are dropped`,
    );
  }
  let kept = 0;
  raw.items.slice(0, MAX_STATUS_ITEMS).forEach((item, index) => {
    const itemPath = `${path}.items[${index}]`;
    if (!isPlainObject(item)) {
      report.error(itemPath, 'must be an object, dropped');
      return;
    }
    let valid = checkText(item.label, TEXT_BOUNDS.statusLabel, `${itemPath}.label`, report);
    if (!isFiniteNumber(item.value)) {
      if (item.value === undefined) {
        report.error(`${itemPath}.value`, 'is required (a finite number or a string ≤ 40 characters)');
        valid = false;
      } else {
        valid = checkText(item.value, TEXT_BOUNDS.statusValue, `${itemPath}.value`, report) && valid;
      }
    }
    checkOptionalIcon(item, itemPath, report);
    checkOptionalEnum(item, 'color', WIDGET_COLORS, itemPath, report);
    if (valid) {
      kept += 1;
    }
  });
  if (kept === 0) {
    report.error(`${path}.items`, 'has no valid row');
    return false;
  }
  return true;
}

/**
 * @description Check a `chart` component.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkChartComponent({ type: 'chart', device_features: ['ext:solar:power'] }, 'components[0]', report);
 */
function checkChartComponent(raw, path, report) {
  checkOptionalEnum(raw, 'chart_type', WIDGET_CHART_TYPES, path, report);
  checkOptionalText(raw, 'title', TEXT_BOUNDS.chartTitle, path, report);
  checkOptionalText(raw, 'unit', TEXT_BOUNDS.unit, path, report);
  let valid = true;
  if (raw.device_features !== undefined) {
    if (!Array.isArray(raw.device_features) || raw.device_features.length === 0) {
      report.error(`${path}.device_features`, 'must be a non-empty array of feature external_ids');
      return false;
    }
    if (raw.device_features.length > MAX_CHART_DEVICE_FEATURES) {
      report.warn(
        `${path}.device_features`,
        `has ${raw.device_features.length} entries, ${MAX_CHART_DEVICE_FEATURES} allowed: the extra ones are dropped`,
      );
    }
    if (!raw.device_features.slice(0, MAX_CHART_DEVICE_FEATURES).every(isDeviceReference)) {
      report.error(`${path}.device_features`, 'must only carry feature external_ids as plain strings');
      return false;
    }
    checkOptionalEnum(raw, 'interval', WIDGET_CHART_INTERVALS, path, report);
    if (raw.series !== undefined) {
      report.warn(path, 'carries both device_features and series: the live features win, series is ignored');
    }
  } else {
    if (!Array.isArray(raw.series)) {
      report.error(path, 'needs series (inline points) or device_features (live history)');
      return false;
    }
    if (raw.series.length > MAX_CHART_SERIES) {
      report.warn(
        `${path}.series`,
        `has ${raw.series.length} series, ${MAX_CHART_SERIES} allowed: the extra ones are dropped`,
      );
    }
    let keptSeries = 0;
    raw.series.slice(0, MAX_CHART_SERIES).forEach((series, index) => {
      const seriesPath = `${path}.series[${index}]`;
      if (!isPlainObject(series) || !Array.isArray(series.points)) {
        report.error(seriesPath, 'must be { name?, points: [{ t, v }] }, dropped');
        return;
      }
      checkOptionalText(series, 'name', TEXT_BOUNDS.seriesName, seriesPath, report);
      if (series.points.length > MAX_CHART_POINTS) {
        report.warn(
          `${seriesPath}.points`,
          `has ${series.points.length} points, ${MAX_CHART_POINTS} allowed: the extra ones are dropped`,
        );
      }
      const validPoints = series.points
        .slice(0, MAX_CHART_POINTS)
        .filter((point) => isPlainObject(point) && isIsoDate(point.t) && isFiniteNumber(point.v));
      if (validPoints.length < Math.min(series.points.length, MAX_CHART_POINTS)) {
        report.warn(`${seriesPath}.points`, 'contains points without a valid ISO `t` and a finite `v`, dropped');
      }
      if (validPoints.length === 0) {
        report.error(`${seriesPath}.points`, 'has no valid point, the series is dropped');
        return;
      }
      keptSeries += 1;
    });
    if (keptSeries === 0) {
      report.error(`${path}.series`, 'has no valid series');
      valid = false;
    }
  }
  if (raw.annotations !== undefined) {
    if (!Array.isArray(raw.annotations)) {
      report.warn(`${path}.annotations`, 'must be an array, ignored');
    } else {
      if (raw.annotations.length > MAX_CHART_ANNOTATIONS) {
        report.warn(
          `${path}.annotations`,
          `has ${raw.annotations.length} entries, ${MAX_CHART_ANNOTATIONS} allowed: the extra ones are dropped`,
        );
      }
      raw.annotations.slice(0, MAX_CHART_ANNOTATIONS).forEach((annotation, index) => {
        const annotationPath = `${path}.annotations[${index}]`;
        if (!isPlainObject(annotation) || !isIsoDate(annotation.t)) {
          report.warn(annotationPath, 'needs an ISO date `t`, dropped');
          return;
        }
        if (annotation.value !== undefined && !isFiniteNumber(annotation.value)) {
          report.warn(`${annotationPath}.value`, 'is not a finite number, ignored');
        }
        checkOptionalText(annotation, 'label', TEXT_BOUNDS.annotationLabel, annotationPath, report);
        checkOptionalEnum(annotation, 'color', WIDGET_COLORS, annotationPath, report);
      });
    }
  }
  if (raw.now_marker !== undefined && raw.now_marker !== true && raw.now_marker !== false) {
    report.warn(`${path}.now_marker`, 'must be a strict boolean, ignored');
  }
  return valid;
}

/**
 * @description Check a `card-list` component.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkCardListComponent({ type: 'card-list', items: [{ title: 'Movie' }] }, 'components[0]', report);
 */
function checkCardListComponent(raw, path, report) {
  checkOptionalEnum(raw, 'display', WIDGET_CARD_LIST_DISPLAYS, path, report);
  const display = isEnum(raw.display, WIDGET_CARD_LIST_DISPLAYS) ? raw.display : 'list';
  if (!Array.isArray(raw.items)) {
    report.error(`${path}.items`, 'is required (an array of { title, ... })');
    return false;
  }
  const maxItems = MAX_CARD_LIST_ITEMS[display];
  if (raw.items.length > maxItems) {
    report.warn(
      `${path}.items`,
      `has ${raw.items.length} items, ${maxItems} allowed in "${display}": the extra ones are dropped`,
    );
  }
  let kept = 0;
  raw.items.slice(0, maxItems).forEach((item, index) => {
    const itemPath = `${path}.items[${index}]`;
    if (!isPlainObject(item)) {
      report.error(itemPath, 'must be an object, dropped');
      return;
    }
    if (item.title === undefined) {
      report.error(`${itemPath}.title`, 'is required');
      return;
    }
    if (!checkText(item.title, TEXT_BOUNDS.cardTitle, `${itemPath}.title`, report)) {
      return;
    }
    checkOptionalText(item, 'subtitle', TEXT_BOUNDS.cardSubtitle, itemPath, report);
    if (item.date !== undefined && !isIsoDate(item.date)) {
      report.warn(`${itemPath}.date`, 'is not an ISO 8601 date, ignored');
    }
    if (item.image !== undefined && (typeof item.image !== 'string' || !WIDGET_IMAGE_KEY_REGEX.test(item.image))) {
      report.warn(`${itemPath}.image`, 'is not an image key (^[a-z0-9][a-z0-9-]{0,63}$), ignored');
    }
    if (item.badge !== undefined) {
      if (!isPlainObject(item.badge)) {
        report.warn(`${itemPath}.badge`, 'must be { text, color? }, ignored');
      } else {
        checkText(item.badge.text, TEXT_BOUNDS.badgeText, `${itemPath}.badge.text`, report);
        checkOptionalEnum(item.badge, 'color', WIDGET_COLORS, `${itemPath}.badge`, report);
      }
    }
    checkOptionalText(item, 'description', TEXT_BOUNDS.cardDescription, itemPath, report);
    if (item.links !== undefined) {
      if (!Array.isArray(item.links)) {
        report.warn(`${itemPath}.links`, 'must be an array of { url, label? }, ignored');
      } else {
        if (item.links.length > MAX_CARD_LINKS) {
          report.warn(
            `${itemPath}.links`,
            `has ${item.links.length} links, ${MAX_CARD_LINKS} allowed: the extra ones are dropped`,
          );
        }
        item.links.slice(0, MAX_CARD_LINKS).forEach((link, linkIndex) => {
          const linkPath = `${itemPath}.links[${linkIndex}]`;
          if (!isPlainObject(link) || !isHttpsUrl(link.url)) {
            report.warn(linkPath, 'needs an https url (≤ 2048 characters, no credentials), dropped');
            return;
          }
          checkOptionalText(link, 'label', TEXT_BOUNDS.linkLabel, linkPath, report);
        });
      }
    }
    kept += 1;
  });
  if (kept === 0) {
    report.error(`${path}.items`, 'has no valid item');
    return false;
  }
  return true;
}

/**
 * @description Check an `image` component.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkImageComponent({ type: 'image', key: 'cleaning-map-3f9a2c' }, 'components[0]', report);
 */
function checkImageComponent(raw, path, report) {
  if (typeof raw.key !== 'string' || !WIDGET_IMAGE_KEY_REGEX.test(raw.key)) {
    report.error(`${path}.key`, 'is required, an image key matching ^[a-z0-9][a-z0-9-]{0,63}$');
    return false;
  }
  checkOptionalText(raw, 'alt', TEXT_BOUNDS.imageAlt, path, report);
  checkOptionalEnum(raw, 'fit', WIDGET_IMAGE_FITS, path, report);
  return true;
}

/**
 * @description Check a `button` component: exactly one of a widget action, a
 * device feature command or a link.
 * @param {object} raw - The raw component.
 * @param {string} path - Path of the component.
 * @param {Report} report - The report.
 * @returns {boolean} True when the core keeps it.
 * @example
 * checkButtonComponent({ type: 'button', label: 'Start', action: { key: 'start' } }, 'components[0]', report);
 */
function checkButtonComponent(raw, path, report) {
  if (raw.label === undefined) {
    report.error(`${path}.label`, 'is required');
    return false;
  }
  if (!checkText(raw.label, TEXT_BOUNDS.buttonLabel, `${path}.label`, report)) {
    return false;
  }
  checkOptionalIcon(raw, path, report);
  checkOptionalEnum(raw, 'style', WIDGET_BUTTON_STYLES, path, report);
  const kinds = ['action', 'device_feature', 'link'].filter((kind) => raw[kind] !== undefined);
  if (kinds.length !== 1) {
    report.error(path, 'must carry exactly one of action, device_feature or link');
    return false;
  }
  const [kind] = kinds;
  if (kind === 'action') {
    if (
      !isPlainObject(raw.action) ||
      typeof raw.action.key !== 'string' ||
      !WIDGET_ACTION_KEY_REGEX.test(raw.action.key)
    ) {
      report.error(`${path}.action.key`, 'is required, matching ^[a-z0-9_]{2,32}$');
      return false;
    }
    if (raw.action.params !== undefined && !isPlainObject(raw.action.params)) {
      report.warn(`${path}.action.params`, 'must be an object, ignored');
    } else if (
      raw.action.params !== undefined &&
      Buffer.byteLength(JSON.stringify(raw.action.params), 'utf8') > MAX_WIDGET_ACTION_PARAMS_BYTES
    ) {
      report.error(`${path}.action.params`, `exceeds ${MAX_WIDGET_ACTION_PARAMS_BYTES} bytes serialized`);
      return false;
    }
    if (raw.action.confirm !== undefined && typeof raw.action.confirm !== 'boolean') {
      report.warn(`${path}.action.confirm`, 'must be a boolean, ignored');
    }
    return true;
  }
  if (kind === 'device_feature') {
    if (!isDeviceReference(raw.device_feature)) {
      report.error(`${path}.device_feature`, 'must be the feature external_id as a plain string');
      return false;
    }
    if (!isFiniteNumber(raw.value)) {
      report.error(`${path}.value`, 'is required next to device_feature (the number to send)');
      return false;
    }
    return true;
  }
  if (!isPlainObject(raw.link) || !isHttpsUrl(raw.link.url)) {
    report.error(`${path}.link.url`, 'is required, an https url (≤ 2048 characters, no credentials)');
    return false;
  }
  return true;
}

const COMPONENT_CHECKERS = {
  text: checkTextComponent,
  value: checkValueComponent,
  gauge: checkGaugeComponent,
  status: checkStatusComponent,
  chart: checkChartComponent,
  'card-list': checkCardListComponent,
  image: checkImageComponent,
  button: checkButtonComponent,
};

/**
 * @description Apply the content budget (section 5) to the components the
 * core keeps, reporting each one it drops.
 * @param {Array} components - `{ raw, path }` of the kept components, in content order.
 * @param {Report} report - The report.
 * @example
 * checkContentBudget(components, report);
 */
function checkContentBudget(components, report) {
  const counters = { components: 0, focal: 0, tiles: 0, texts: 0, bodyTexts: 0, status: 0, buttons: 0 };
  const seenActionKeys = new Set();
  const budget = WIDGET_CONTENT_BUDGET;
  components.forEach(({ raw, path }) => {
    const drop = (reason) => report.error(path, `${raw.type} component dropped by the content budget (${reason})`);
    if (counters.components >= budget.components) {
      drop(`${components.length} components, ${budget.components} allowed`);
      return;
    }
    if (FOCAL_TYPES.includes(raw.type)) {
      if (counters.focal >= budget.focal) {
        drop('a second focal component: chart, card-list and image count as one');
        return;
      }
      counters.focal += 1;
    } else if (TILE_TYPES.includes(raw.type)) {
      if (counters.tiles >= budget.tiles) {
        drop(`more than ${budget.tiles} tiles`);
        return;
      }
      counters.tiles += 1;
    } else if (raw.type === 'text') {
      if (counters.texts >= budget.texts) {
        drop(`more than ${budget.texts} texts`);
        return;
      }
      // an unknown variant renders as body, like the core defaults it
      const isBody = !isEnum(raw.variant, WIDGET_TEXT_VARIANTS) || raw.variant === 'body';
      if (isBody && counters.bodyTexts >= budget.bodyTexts) {
        drop('a second body text');
        return;
      }
      if (isBody) {
        counters.bodyTexts += 1;
      }
      counters.texts += 1;
    } else if (raw.type === 'status') {
      if (counters.status >= budget.status) {
        drop('a second status list');
        return;
      }
      counters.status += 1;
    } else if (raw.type === 'button') {
      if (counters.buttons >= budget.buttons) {
        drop(`more than ${budget.buttons} buttons`);
        return;
      }
      if (isPlainObject(raw.action) && typeof raw.action.key === 'string') {
        if (seenActionKeys.has(raw.action.key)) {
          drop(`duplicate action key "${raw.action.key}"`);
          return;
        }
        seenActionKeys.add(raw.action.key);
      }
      counters.buttons += 1;
    }
    counters.components += 1;
  });
}

/**
 * @description Validate a widget content against the vocabulary and the
 * content budget of the Gladys core (contract "dashboard widgets", sections
 * 4 and 5), the way the core will normalize it: the result lists, as
 * human-readable strings, what the core would refuse (the whole content),
 * drop (a component, an item) or silently alter (a truncated text, a clamped
 * TTL, an ignored optional field). An empty array means the content reaches
 * the dashboard exactly as sent. Run by the SDK in dev mode on every content
 * resolved by an onWidgetGet handler; also handy in the integration's own
 * tests.
 * @param {any} content - The content an onWidgetGet handler resolves.
 * @returns {Array<string>} The violations, empty when the content is clean.
 * @example
 * const issues = validateWidgetContent({ version: 1, components: [{ type: 'text', text: 'Hello' }] });
 */
function validateWidgetContent(content) {
  const report = new Report();
  if (!isPlainObject(content)) {
    report.error('content', 'must be an object { version?, ttl_seconds?, components } — refused by Gladys');
    return report.issues;
  }
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > MAX_WIDGET_CONTENT_BYTES) {
    report.error('content', `exceeds ${MAX_WIDGET_CONTENT_BYTES / 1024} KB serialized — refused by Gladys`);
  }
  if (content.version !== undefined) {
    if (!Number.isInteger(content.version) || content.version < 1) {
      report.error('content.version', 'must be an integer ≥ 1 — refused by Gladys');
    } else if (content.version > SUPPORTED_WIDGET_CONTENT_VERSION) {
      report.error(
        'content.version',
        `${content.version} is above the version this SDK knows (${SUPPORTED_WIDGET_CONTENT_VERSION}): a Gladys that does not support it refuses the content`,
      );
    }
  }
  if (content.ttl_seconds !== undefined) {
    if (!isFiniteNumber(content.ttl_seconds)) {
      report.warn('content.ttl_seconds', `is not a finite number, ${WIDGET_CONTENT_TTL_DEFAULT_SECONDS} s is used`);
    } else if (
      content.ttl_seconds < WIDGET_CONTENT_TTL_MIN_SECONDS ||
      content.ttl_seconds > WIDGET_CONTENT_TTL_MAX_SECONDS
    ) {
      report.warn(
        'content.ttl_seconds',
        `is clamped to ${WIDGET_CONTENT_TTL_MIN_SECONDS}-${WIDGET_CONTENT_TTL_MAX_SECONDS} s by Gladys`,
      );
    }
  }
  if (!Array.isArray(content.components)) {
    report.error('content.components', 'is required (an array) — refused by Gladys');
    return report.issues;
  }
  const kept = [];
  content.components.forEach((raw, index) => {
    const path = `components[${index}]`;
    if (!isPlainObject(raw)) {
      report.error(path, 'must be an object, dropped');
      return;
    }
    const check = COMPONENT_CHECKERS[raw.type];
    if (!check) {
      report.error(
        path,
        `has an unknown type "${raw.type}", dropped (known: ${Object.keys(COMPONENT_CHECKERS).join(', ')})`,
      );
      return;
    }
    if (check(raw, path, report)) {
      kept.push({ raw, path });
    }
  });
  checkContentBudget(kept, report);
  return report.issues;
}

// Image validation (section 6): magic numbers, decoded size, and the pixel
// size read from the header — the core refuses, it never repairs.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50];
const WEBP_MAGIC_OFFSET = 8;

const hasMagic = (bytes, magic, offset = 0) =>
  bytes.length > offset + magic.length && magic.every((byte, index) => bytes[offset + index] === byte);

/**
 * @description Read the pixel size of a PNG from its IHDR chunk.
 * @param {Buffer} bytes - The decoded image.
 * @returns {object|null} `{ width, height }`, or null.
 * @example
 * readPngDimensions(bytes);
 */
function readPngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * @description Read the pixel size of a JPEG from its first SOF marker.
 * @param {Buffer} bytes - The decoded image.
 * @returns {object|null} `{ width, height }`, or null.
 * @example
 * readJpegDimensions(bytes);
 */
function readJpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
    } else if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
    } else {
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd9 || marker === 0xda) {
        return null;
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/**
 * @description Read the pixel size of a WebP from its first chunk (VP8,
 * VP8L or VP8X).
 * @param {Buffer} bytes - The decoded image.
 * @returns {object|null} `{ width, height }`, or null.
 * @example
 * readWebpDimensions(bytes);
 */
function readWebpDimensions(bytes) {
  if (bytes.length < 30) {
    return null;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) {
      return null;
    }
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  return null;
}

const DIMENSION_READERS = {
  'image/png': readPngDimensions,
  'image/jpeg': readJpegDimensions,
  'image/webp': readWebpDimensions,
};

/**
 * @description Validate an image an onWidgetGetImage handler resolves, the
 * way the Gladys core will (contract "dashboard widgets", section 6): raw
 * base64 (no data-URI prefix) of a PNG, JPEG or WebP — checked by magic
 * numbers — of at most 300 KB decoded, whose header declares a pixel size of
 * at most 4096 × 4096. The core validates and refuses, it never recompresses:
 * resize the image integration-side (`sharp` at the display width, encoded
 * as WebP, weighs a few tens of KB). Returns the violations as human-readable
 * strings, empty when the core serves the image.
 * @param {any} rawBase64 - The value an onWidgetGetImage handler resolves.
 * @returns {Array<string>} The violations, empty when the image is clean.
 * @example
 * const issues = validateWidgetImage(pngBuffer.toString('base64'));
 */
function validateWidgetImage(rawBase64) {
  const maxKb = Math.round(MAX_WIDGET_IMAGE_BYTES / 1024);
  if (typeof rawBase64 !== 'string' || rawBase64.length === 0) {
    return ['image: must be a non-empty raw base64 string (no data-URI prefix)'];
  }
  if (/^data:/i.test(rawBase64)) {
    return ['image: must be RAW base64, without the data-URI prefix'];
  }
  const bytes = Buffer.from(rawBase64, 'base64');
  if (bytes.length === 0) {
    return ['image: is not valid base64'];
  }
  if (bytes.length > MAX_WIDGET_IMAGE_BYTES) {
    return [`image: ${Math.ceil(bytes.length / 1024)} KB decoded, ${maxKb} KB allowed — resize it integration-side`];
  }
  let mimeType = null;
  if (hasMagic(bytes, PNG_MAGIC)) {
    mimeType = 'image/png';
  } else if (hasMagic(bytes, JPEG_MAGIC)) {
    mimeType = 'image/jpeg';
  } else if (hasMagic(bytes, RIFF_MAGIC) && hasMagic(bytes, WEBP_MAGIC, WEBP_MAGIC_OFFSET)) {
    mimeType = 'image/webp';
  }
  if (mimeType === null) {
    return ['image: not a PNG, JPEG or WebP (magic numbers)'];
  }
  const dimensions = DIMENSION_READERS[mimeType](bytes);
  if (dimensions === null) {
    return [`image: unreadable ${mimeType} header, pixel size unknown — refused by Gladys`];
  }
  const max = MAX_WIDGET_IMAGE_DIMENSION;
  if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > max || dimensions.height > max) {
    return [`image: ${dimensions.width}×${dimensions.height} px, at most ${max}×${max} allowed`];
  }
  return [];
}

module.exports = {
  WIDGET_COLORS,
  WIDGET_TEXT_VARIANTS,
  WIDGET_CHART_TYPES,
  WIDGET_CHART_INTERVALS,
  WIDGET_CARD_LIST_DISPLAYS,
  WIDGET_IMAGE_FITS,
  WIDGET_BUTTON_STYLES,
  WIDGET_CONTENT_BUDGET,
  SUPPORTED_WIDGET_CONTENT_VERSION,
  MAX_WIDGET_CONTENT_BYTES,
  WIDGET_CONTENT_TTL_MIN_SECONDS,
  WIDGET_CONTENT_TTL_MAX_SECONDS,
  WIDGET_CONTENT_TTL_DEFAULT_SECONDS,
  WIDGET_KEY_REGEX,
  WIDGET_IMAGE_KEY_REGEX,
  MAX_WIDGET_MESSAGE_LENGTH,
  MAX_WIDGET_IMAGE_BYTES,
  MAX_WIDGET_IMAGE_DIMENSION,
  validateWidgetContent,
  validateWidgetImage,
};
