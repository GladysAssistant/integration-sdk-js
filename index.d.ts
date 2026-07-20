/// <reference types="node" />

import { EventEmitter } from 'events';

/**
 * Options of the GladysIntegration constructor. Every option defaults to the
 * environment variables injected in the integration container (contract C.7).
 */
export interface GladysIntegrationOptions {
  /** Host API base URL. Default: GLADYS_HOST_API_URL env var. */
  hostApiUrl?: string;
  /** Integration JWT. Default: GLADYS_INTEGRATION_TOKEN env var. */
  token?: string;
  /** Integration selector. Default: GLADYS_INTEGRATION_SELECTOR env var. */
  selector?: string;
  /** First reconnection delay in milliseconds. Default: 1000. */
  reconnectBaseDelay?: number;
  /** Reconnection delay cap in milliseconds. Default: 60000. */
  reconnectMaxDelay?: number;
  /** Host API request timeout in milliseconds. Default: 15000. */
  requestTimeout?: number;
  /**
   * Logger used for the connection lifecycle logs (connections,
   * disconnections, reconnection attempts, authentication failures).
   * Default: `createLogger({ name: 'gladys-sdk' })`. Pass
   * `createLogger({ level: 'silent' })` to silence the SDK entirely.
   */
  logger?: Logger;
}

/** A device feature, in the standard Gladys format. */
export interface DeviceFeature {
  name?: string;
  external_id: string;
  selector?: string;
  category: string;
  type: string;
  unit?: string;
  min?: number;
  max?: number;
  read_only?: boolean;
  has_feedback?: boolean;
  keep_history?: boolean;
  last_value?: number;
  last_value_string?: string;
  [key: string]: unknown;
}

/** A device param (free key/value attached to a device). */
export interface DeviceParam {
  name: string;
  value: string;
}

/** A device, in the standard Gladys format. */
export interface Device {
  id?: string;
  name?: string;
  selector?: string;
  external_id: string;
  features?: DeviceFeature[];
  params?: DeviceParam[];
  poll_frequency?: number;
  [key: string]: unknown;
}

/** One state of the POST /state batch (contract C.3). */
export interface DeviceState {
  device_feature_external_id: string;
  state?: number;
  text?: string;
  created_at?: string | Date;
}

/** Integration configuration values, keyed by config_schema key. */
export type IntegrationConfig = Record<string, unknown>;

/** Response of GET /status (contract C.3). */
export interface IntegrationStatus {
  gladys_version: string;
  service: {
    id: string;
    selector: string;
    status: string;
    version: string;
  };
}

/** Generic success response of the host API. */
export interface SuccessResponse {
  success: boolean;
}

/** Response of POST /discovered_device. */
export interface PublishDiscoveredDevicesResponse extends SuccessResponse {
  count: number;
}

/**
 * Error thrown for every non-2xx response of the Gladys host API, carrying the
 * standard Gladys error attributes.
 */
export declare class GladysApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string);
}

/** External ids of one physical device, built by `gladys.externalIds()`. */
export interface DeviceExternalIds {
  /** The device external_id: `ext:<selector>:<type>:<platformId>`. */
  device: string;
  /** Build a feature external_id: `ext:<selector>:<type>:<platformId>:<featureKey>`. */
  feature(featureKey: string): string;
}

/** Levels accepted by the logger (LOG_LEVEL env var or `level` option). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Options of createLogger. */
export interface LoggerOptions {
  /** Prefix added to every line, e.g. the module name. */
  name?: string;
  /** Pinned level, bypassing the LOG_LEVEL env var. */
  level?: LogLevel;
}

/**
 * Standard integration logger. debug/info write to stdout, warn/error to
 * stderr — both are captured by the Gladys supervisor (docker logs). The level
 * comes from the LOG_LEVEL env var (default: info) unless pinned.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Derive a logger with a nested name: `parent:child`. */
  child(name: string): Logger;
}

/** Create a logger (see the Logger interface). */
export declare function createLogger(options?: LoggerOptions): Logger;

/** Shared default logger (no name, level from LOG_LEVEL). */
export declare const logger: Logger;

/** Standard Gladys device-feature categories (mirror of server/utils/constants.js). */
export declare const DEVICE_FEATURE_CATEGORIES: {
  readonly CHILD_LOCK: 'child-lock';
  readonly AIRQUALITY_SENSOR: 'airquality-sensor';
  readonly AIR_CONDITIONING: 'air-conditioning';
  readonly ANGLE_SENSOR: 'angle-sensor';
  readonly BATTERY: 'battery';
  readonly BATTERY_LOW: 'battery-low';
  readonly BUTTON: 'button';
  readonly CAMERA: 'camera';
  readonly CUBE: 'cube';
  readonly CURRENCY: 'currency';
  readonly CO_SENSOR: 'co-sensor';
  readonly CO2_SENSOR: 'co2-sensor';
  readonly COUNTER_SENSOR: 'counter-sensor';
  readonly CURTAIN: 'curtain';
  readonly DATA: 'data';
  readonly DATARATE: 'datarate';
  readonly DEVICE_TEMPERATURE_SENSOR: 'device-temperature-sensor';
  readonly DISTANCE_SENSOR: 'distance-sensor';
  readonly DURATION: 'duration';
  readonly ELECTRICAL_VEHICLE_BATTERY: 'electrical-vehicle-battery';
  readonly ELECTRICAL_VEHICLE_CHARGE: 'electrical-vehicle-charge';
  readonly ELECTRICAL_VEHICLE_DRIVE: 'electrical-vehicle-drive';
  readonly ELECTRICAL_VEHICLE_CONSUMPTION: 'electrical-vehicle-consumption';
  readonly ELECTRICAL_VEHICLE_STATE: 'electrical-vehicle-state';
  readonly ELECTRICAL_VEHICLE_CLIMATE: 'electrical-vehicle-climate';
  readonly ELECTRICAL_VEHICLE_COMMAND: 'electrical-vehicle-command';
  readonly ENERGY_SENSOR: 'energy-sensor';
  readonly ENERGY_PRODUCTION_SENSOR: 'energy-production-sensor';
  readonly FAN: 'fan';
  readonly HEATER: 'heater';
  readonly HEPA_FILTER_MONITORING: 'hepa-filter-monitoring';
  readonly HUMIDITY_SENSOR: 'humidity-sensor';
  readonly LEAK_SENSOR: 'leak-sensor';
  readonly LIGHT: 'light';
  readonly LIGHT_SENSOR: 'light-sensor';
  readonly LEVEL_SENSOR: 'level-sensor';
  readonly MOTION_SENSOR: 'motion-sensor';
  readonly LOCK: 'lock';
  readonly MUSIC: 'music';
  readonly NOISE_SENSOR: 'noise-sensor';
  readonly OPENING_SENSOR: 'opening-sensor';
  readonly ORP_SENSOR: 'orp-sensor';
  readonly PH_SENSOR: 'ph-sensor';
  readonly PM25_SENSOR: 'pm25-sensor';
  readonly PM10_SENSOR: 'pm10-sensor';
  readonly FORMALDEHYD_SENSOR: 'formaldehyd-sensor';
  readonly PRECIPITATION_SENSOR: 'precipitation-sensor';
  readonly PRESENCE_SENSOR: 'presence-sensor';
  readonly PRESSURE_SENSOR: 'pressure-sensor';
  readonly RAIN_SENSOR: 'rain-sensor';
  readonly RISK: 'risk';
  readonly SHUTTER: 'shutter';
  readonly SIGNAL: 'signal';
  readonly SIREN: 'siren';
  readonly SISMIC_SENSOR: 'sismic-sensor';
  readonly BATTERY_STORAGE: 'battery-storage';
  readonly SMOKE_SENSOR: 'smoke-sensor';
  readonly SOIL_MOISTURE_SENSOR: 'soil-moisture-sensor';
  readonly SURFACE: 'surface';
  readonly SWITCH: 'switch';
  readonly SPEED_SENSOR: 'speed-sensor';
  readonly TAMPER: 'tamper';
  readonly TELEINFORMATION: 'teleinformation';
  readonly TELEVISION: 'television';
  readonly TEMPERATURE_SENSOR: 'temperature-sensor';
  readonly THERMOSTAT: 'thermostat';
  readonly UNKNOWN: 'unknown';
  readonly UV_SENSOR: 'uv-sensor';
  readonly VIBRATION_SENSOR: 'vibration-sensor';
  readonly VOC_SENSOR: 'voc-sensor';
  readonly VOC_INDEX_SENSOR: 'voc-index-sensor';
  readonly VOC_MATTER_INDEX_SENSOR: 'voc-matter-index-sensor';
  readonly NO2_MATTER_INDEX_SENSOR: 'no2-matter-index-sensor';
  readonly VOLUME_SENSOR: 'volume-sensor';
  readonly VACUUM_CLEANER: 'vacuum-cleaner';
  readonly TEXT: 'text';
  readonly INPUT: 'input';
};

/** Standard Gladys device-feature types, grouped by category (mirror of server/utils/constants.js). */
export declare const DEVICE_FEATURE_TYPES: {
  readonly LIGHT: {
    readonly BINARY: 'binary';
    readonly BRIGHTNESS: 'brightness';
    readonly HUE: 'hue';
    readonly SATURATION: 'saturation';
    readonly COLOR: 'color';
    readonly TEMPERATURE: 'temperature';
    readonly POWER: 'power';
    readonly EFFECT_MODE: 'effect-mode';
    readonly EFFECT_SPEED: 'effect-speed';
  };
  readonly SENSOR: {
    readonly DECIMAL: 'decimal';
    readonly INTEGER: 'integer';
    readonly BINARY: 'binary';
    readonly PUSH: 'push';
    readonly UNKNOWN: 'unknown';
  };
  readonly TEMPERATURE_SENSOR: {
    readonly MIN: 'min';
    readonly MAX: 'max';
    readonly AVERAGE: 'average';
  };
  readonly SWITCH: {
    readonly BINARY: 'binary';
    readonly POWER: 'power';
    readonly ENERGY: 'energy';
    readonly VOLTAGE: 'voltage';
    readonly CURRENT: 'current';
    readonly BURGLAR: 'burglar';
    readonly DIMMER: 'dimmer';
    readonly TARGET_CURRENT: 'target-current';
  };
  readonly LOCK: {
    readonly BINARY: 'binary';
    readonly INTEGER: 'integer';
    readonly STATE: 'state';
  };
  readonly CAMERA: {
    readonly IMAGE: 'image';
  };
  readonly SIREN: {
    readonly BINARY: 'binary';
    readonly LMH_VOLUME: 'lmh_volume';
    readonly MELODY: 'melody';
  };
  readonly CHILD_LOCK: {
    readonly BINARY: 'binary';
  };
  readonly CUBE: {
    readonly MODE: 'mode';
    readonly ROTATION: 'rotation';
  };
  readonly BATTERY: {
    readonly INTEGER: 'integer';
  };
  readonly BATTERY_LOW: {
    readonly BINARY: 'binary';
  };
  readonly VIBRATION_SENSOR: {
    readonly BINARY: 'binary';
    readonly STATUS: 'status';
    readonly TILT_ANGLE: 'tilt-angle';
    readonly ACCELERATION_X: 'acceleration-x';
    readonly ACCELERATION_Y: 'acceleration-y';
    readonly ACCELERATION_Z: 'acceleration-z';
    readonly ANGLE_X: 'angle-x';
    readonly ANGLE_Y: 'angle-y';
    readonly ANGLE_Z: 'angle-z';
    readonly BED_ACTIVITY: 'bed-activity';
  };
  readonly BUTTON: {
    readonly CLICK: 'click';
    readonly PUSH: 'push';
  };
  readonly SIGNAL: {
    readonly QUALITY: 'integer';
  };
  readonly AIR_CONDITIONING: {
    readonly BINARY: 'binary';
    readonly MODE: 'mode';
    readonly TARGET_TEMPERATURE: 'target-temperature';
  };
  readonly FAN: {
    readonly MODE: 'mode';
    readonly PERCENT: 'percent';
    readonly SPEED: 'speed';
    readonly AIRFLOW_DIRECTION: 'airflow-direction';
    readonly ROCK_SETTING: 'rock-setting';
    readonly WIND_SETTING: 'wind-setting';
  };
  readonly HEATER: {
    readonly PILOT_WIRE_MODE: 'pilot-wire-mode';
  };
  readonly SURFACE: {
    readonly DECIMAL: 'decimal';
  };
  readonly TAMPER: {
    readonly BINARY: 'binary';
  };
  readonly TELEVISION: {
    readonly BINARY: 'binary';
    readonly SOURCE: 'source';
    readonly GUIDE: 'guide';
    readonly MENU: 'menu';
    readonly TOOLS: 'tools';
    readonly INFO: 'info';
    readonly ENTER: 'enter';
    readonly RETURN: 'return';
    readonly EXIT: 'exit';
    readonly LEFT: 'left';
    readonly RIGHT: 'right';
    readonly UP: 'up';
    readonly DOWN: 'down';
    readonly CHANNEL_UP: 'channel-up';
    readonly CHANNEL_DOWN: 'channel-down';
    readonly CHANNEL_PREVIOUS: 'channel-previous';
    readonly CHANNEL: 'channel';
    readonly VOLUME_UP: 'volume-up';
    readonly VOLUME_DOWN: 'volume-down';
    readonly VOLUME_MUTE: 'volume-mute';
    readonly VOLUME: 'volume';
    readonly PLAY: 'play';
    readonly PAUSE: 'pause';
    readonly STOP: 'stop';
    readonly PREVIOUS: 'previous';
    readonly NEXT: 'next';
    readonly REWIND: 'rewind';
    readonly FORWARD: 'forward';
    readonly RECORD: 'record';
  };
  readonly MUSIC: {
    readonly VOLUME: 'volume';
    readonly PLAY: 'play';
    readonly PAUSE: 'pause';
    readonly PREVIOUS: 'previous';
    readonly NEXT: 'next';
    readonly PLAYBACK_STATE: 'playback_state';
    readonly PLAY_NOTIFICATION: 'play_notification';
  };
  readonly ENERGY_SENSOR: {
    readonly BINARY: 'binary';
    readonly POWER: 'power';
    readonly ENERGY: 'energy';
    readonly VOLTAGE: 'voltage';
    readonly CURRENT: 'current';
    readonly INDEX: 'index';
    readonly INDEX_TODAY: 'index-today';
    readonly INDEX_YESTERDAY: 'index-yesterday';
    readonly DAILY_CONSUMPTION: 'daily-consumption';
    readonly DAILY_CONSUMPTION_COST: 'daily-consumption-cost';
    readonly THIRTY_MINUTES_CONSUMPTION: 'thirty-minutes-consumption';
    readonly THIRTY_MINUTES_CONSUMPTION_COST: 'thirty-minutes-consumption-cost';
  };
  readonly ENERGY_PRODUCTION_SENSOR: {
    readonly INDEX: 'index';
    readonly DAILY_PRODUCTION: 'daily-production';
    readonly DAILY_PRODUCTION_REVENUE: 'daily-production-revenue';
    readonly THIRTY_MINUTES_PRODUCTION: 'thirty-minutes-production';
    readonly THIRTY_MINUTES_PRODUCTION_REVENUE: 'thirty-minutes-production-revenue';
  };
  readonly BATTERY_STORAGE: {
    // State of charge, percentage (0..100)
    readonly BATTERY_LEVEL: 'battery-level';
    // Power flowing into the battery, W/kW (>= 0)
    readonly CHARGE_POWER: 'charge-power';
    // Power flowing out of the battery, W/kW (>= 0)
    readonly DISCHARGE_POWER: 'discharge-power';
    // Cumulative energy charged, kWh
    readonly CHARGE_INDEX: 'charge-index';
    // Cumulative energy discharged, kWh
    readonly DISCHARGE_INDEX: 'discharge-index';
    // Currently available stored energy (instantaneous), kWh
    readonly BATTERY_ENERGY_REMAINING: 'battery-energy-remaining';
  };
  readonly TELEINFORMATION: {
    readonly BINARY: 'binary';
    readonly EAST: 'east';
    readonly EAIT: 'eait';
    readonly EASF01: 'easf01';
    readonly EASF02: 'easf02';
    readonly EASF03: 'easf03';
    readonly EASF04: 'easf04';
    readonly EASF05: 'easf05';
    readonly EASF06: 'easf06';
    readonly EASF07: 'easf07';
    readonly EASF08: 'easf08';
    readonly EASF09: 'easf09';
    readonly EASF10: 'easf10';
    readonly PREF: 'pref';
    readonly PCOUP: 'pcoup';
    readonly VTIC: 'vtic';
    readonly CCASN: 'ccasn';
    readonly CCASN_1: 'ccasn_1';
    readonly UMOY1: 'umoy1';
    readonly UMOY2: 'umoy2';
    readonly UMOY3: 'umoy3';
    readonly ERQ1: 'erq1';
    readonly ERQ2: 'erq2';
    readonly ERQ3: 'erq3';
    readonly ERQ4: 'erq4';
    readonly IRMS1: 'irms1';
    readonly IRMS2: 'irms2';
    readonly IRMS3: 'irms3';
    readonly URMS1: 'urms1';
    readonly URMS2: 'urms2';
    readonly URMS3: 'urms3';
    readonly EASD01: 'easd01';
    readonly EASD02: 'easd02';
    readonly EASD03: 'easd03';
    readonly EASD04: 'easd04';
    readonly NTARF: 'ntarf';
    readonly CCAIN: 'ccain';
    readonly CCAIN_1: 'ccain_1';
    readonly SINSTI: 'sinsti';
    readonly SMAXIN: 'smaxin';
    readonly SMAXIN_1: 'smaxin_1';
    readonly SMAXN: 'smaxn';
    readonly SMAXN2: 'smaxn2';
    readonly SMAXN3: 'smaxn3';
    readonly SINSTS: 'sinsts';
    readonly SINSTS2: 'sinsts2';
    readonly SINSTS3: 'sinsts3';
    readonly SMAXN_1: 'smaxn_1';
    readonly SMAXN2_1: 'smaxn2_1';
    readonly SMAXN3_1: 'smaxn3_1';
    readonly HHPHC: 'hhphc';
    readonly IMAX: 'imax';
    readonly ADPS: 'adps';
    readonly IMAX2: 'imax2';
    readonly IMAX3: 'imax3';
    readonly ADIR1: 'adir1';
    readonly ADIR2: 'adir2';
    readonly ADIR3: 'adir3';
  };
  readonly SPEED_SENSOR: {
    readonly DECIMAL: 'decimal';
    readonly INTEGER: 'integer';
  };
  readonly UV_SENSOR: {
    readonly INTEGER: 'integer';
  };
  readonly CURRENCY: {
    readonly DECIMAL: 'decimal';
  };
  readonly PRECIPITATION_SENSOR: {
    readonly DECIMAL: 'decimal';
    readonly INTEGER: 'integer';
  };
  readonly VOLUME_SENSOR: {
    readonly DECIMAL: 'decimal';
    readonly INTEGER: 'integer';
  };
  readonly DURATION: {
    readonly DECIMAL: 'decimal';
    readonly INTEGER: 'integer';
  };
  readonly VOC_SENSOR: {
    readonly DECIMAL: 'decimal';
  };
  readonly VOC_INDEX_SENSOR: {
    readonly INTEGER: 'integer';
  };
  readonly SHUTTER: {
    readonly STATE: 'state';
    readonly POSITION: 'position';
  };
  readonly CURTAIN: {
    readonly STATE: 'state';
    readonly POSITION: 'position';
  };
  readonly DATA: {
    readonly SIZE: 'size';
  };
  readonly DATARATE: {
    readonly RATE: 'rate';
  };
  readonly UNKNOWN: {
    readonly UNKNOWN: 'unknown';
  };
  readonly THERMOSTAT: {
    readonly TARGET_TEMPERATURE: 'target-temperature';
  };
  readonly AIRQUALITY_SENSOR: {
    readonly AQI: 'aqi';
  };
  readonly PH_SENSOR: {
    readonly DECIMAL: 'decimal';
  };
  readonly ORP_SENSOR: {
    readonly DECIMAL: 'decimal';
  };
  readonly TEXT: {
    readonly TEXT: 'text';
  };
  readonly RISK: {
    readonly INTEGER: 'integer';
  };
  readonly INPUT: {
    readonly BINARY: 'binary';
  };
  readonly LEVEL_SENSOR: {
    readonly LIQUID_STATE: 'liquid-state';
    readonly LIQUID_LEVEL_PERCENT: 'liquid-level-percent';
    readonly LIQUID_DEPTH: 'liquid-depth';
  };
  readonly ELECTRICAL_VEHICLE_BATTERY: {
    readonly BATTERY_ENERGY_REMAINING: 'battery-energy-remaining';
    readonly BATTERY_LEVEL: 'battery-level';
    readonly BATTERY_POWER: 'battery-power';
    readonly BATTERY_RANGE_ESTIMATE: 'battery-range-estimate';
    readonly BATTERY_TEMPERATURE: 'battery-temperature';
    readonly BATTERY_VOLTAGE: 'battery-voltage';
  };
  readonly ELECTRICAL_VEHICLE_CHARGE: {
    readonly CHARGE_CURRENT: 'charge-current';
    readonly CHARGE_ENERGY_ADDED_TOTAL: 'charge-energy-added-total';
    readonly CHARGE_ENERGY_CONSUMPTION_TOTAL: 'charge-energy-consumption-total';
    readonly CHARGE_ON: 'charge-on';
    readonly CHARGE_POWER: 'charge-power';
    readonly CHARGE_VOLTAGE: 'charge-voltage';
    readonly LAST_CHARGE_ENERGY_ADDED: 'last-charge-energy-added';
    readonly LAST_CHARGE_ENERGY_CONSUMPTION: 'last-charge-energy-consumption';
    readonly PLUGGED: 'plugged';
    readonly TARGET_CHARGE_LIMIT: 'target-charge-limit';
    readonly TARGET_CURRENT: 'target-current';
  };
  readonly ELECTRICAL_VEHICLE_CLIMATE: {
    readonly CLIMATE_ON: 'climate-on';
    readonly INDOOR_TEMPERATURE: 'indoor-temperature';
    readonly TARGET_TEMPERATURE: 'target-temperature';
  };
  readonly ELECTRICAL_VEHICLE_COMMAND: {
    readonly ALARM: 'alarm';
    readonly LOCK: 'lock';
  };
  readonly ELECTRICAL_VEHICLE_DRIVE: {
    readonly DRIVE_ENERGY_CONSUMPTION_TOTAL: 'drive-energy-consumption-total';
    readonly SPEED: 'speed';
  };
  readonly ELECTRICAL_VEHICLE_CONSUMPTION: {
    readonly ENERGY_CONSUMPTION: 'energy-consumption';
    readonly ENERGY_EFFICIENCY: 'energy-efficiency';
  };
  readonly ELECTRICAL_VEHICLE_STATE: {
    readonly DOOR_OPENED: 'door-opened';
    readonly ODOMETER: 'odometer';
    readonly TIRE_PRESSURE: 'tire-pressure';
    readonly WINDOW_OPENED: 'window-opened';
  };
  readonly FILTER_MONITORING: {
    readonly FILTER_LIFE_REMAINING: 'filter-life-remaining';
  };
  readonly VACUUM_CLEANER: {
    readonly STATE: 'state';
    readonly RUN_MODE: 'run-mode';
    readonly CLEAN_MODE: 'clean-mode';
    readonly DOCK: 'dock';
  };
};

/** Standard Gladys device-feature units (mirror of server/utils/constants.js). */
export declare const DEVICE_FEATURE_UNITS: {
  readonly CELSIUS: 'celsius';
  readonly FAHRENHEIT: 'fahrenheit';
  readonly KELVIN: 'kelvin';
  readonly PERCENT: 'percent';
  readonly PASCAL: 'pascal';
  readonly HECTO_PASCAL: 'hPa';
  readonly KILO_PASCAL: 'kPa';
  readonly BAR: 'bar';
  readonly PSI: 'psi';
  readonly MILLIBAR: 'milli-bar';
  readonly LUX: 'lux';
  readonly PPM: 'ppm';
  readonly PPB: 'ppb';
  readonly PPT: 'ppt';
  readonly WATT: 'watt';
  readonly KILOWATT: 'kilowatt';
  readonly WATT_HOUR: 'watt-hour';
  readonly KILOWATT_HOUR: 'kilowatt-hour';
  readonly MEGAWATT_HOUR: 'megawatt-hour';
  readonly AMPERE: 'ampere';
  readonly MILLI_AMPERE: 'milliampere';
  readonly MILLI_VOLT: 'millivolt';
  readonly VOLT: 'volt';
  readonly KILOVOLT_AMPERE: 'kilovolt-ampere';
  readonly VOLT_AMPERE: 'volt-ampere';
  readonly VOLT_AMPERE_REACTIVE: 'volt-ampere-reactive';
  readonly WATT_HOUR_PER_KM: 'watt-hour-per-km';
  readonly KILOWATT_HOUR_PER_100_KM: 'kilowatt-hour-per-100-km';
  readonly WATT_HOUR_PER_MILE: 'watt-hour-per-mile';
  readonly KILOWATT_HOUR_PER_100_MILE: 'kilowatt-hour-per-100-mile';
  readonly KM_PER_KILOWATT_HOUR: 'km-per-kilowatt-hour';
  readonly MILE_PER_KILOWATT_HOUR: 'mile-per-kilowatt-hour';
  readonly MM: 'mm';
  readonly CM: 'cm';
  readonly M: 'm';
  readonly KM: 'km';
  readonly INCH: 'inch';
  readonly FEET: 'feet';
  readonly MILE: 'mile';
  readonly SQUARE_CENTIMETER: 'square-centimeter';
  readonly SQUARE_METER: 'square-meter';
  readonly SQUARE_KILOMETER: 'square-kilometer';
  readonly DEGREE: 'degree';
  readonly LITER: 'liter';
  readonly MILLILITER: 'milliliter';
  readonly CUBIC_METER: 'cubicmeter';
  readonly EURO: 'euro';
  readonly DOLLAR: 'dollar';
  readonly BITCOIN: 'bitcoin';
  readonly LITECOIN: 'litecoin';
  readonly DOGECOIN: 'dogecoin';
  readonly ETHEREUM: 'ethereum';
  readonly POUND_STERLING: 'pound-sterling';
  readonly METER_PER_SECOND: 'meter-per-second';
  readonly KILOMETER_PER_HOUR: 'kilometer-per-hour';
  readonly FEET_PER_SECOND: 'feet-per-second';
  readonly MILE_PER_HOUR: 'mile-per-hour';
  readonly MILLIMETER_PER_HOUR: 'millimeter-per-hour';
  readonly MILLIMETER_PER_DAY: 'millimeter-per-day';
  readonly UV_INDEX: 'uv-index';
  readonly MICROSECONDS: 'microseconds';
  readonly MILLISECONDS: 'milliseconds';
  readonly SECONDS: 'seconds';
  readonly MINUTES: 'minutes';
  readonly HOURS: 'hours';
  readonly DAYS: 'days';
  readonly WEEKS: 'weeks';
  readonly MONTHS: 'months';
  readonly YEARS: 'years';
  readonly BIT: 'bit';
  readonly KILOBIT: 'kilobit';
  readonly MEGABIT: 'megabit';
  readonly GIGABIT: 'gigabit';
  readonly BYTE: 'byte';
  readonly KILOBYTE: 'kilobyte';
  readonly MEGABYTE: 'megabyte';
  readonly GIGABYTE: 'gigabyte';
  readonly TERABYTE: 'terabyte';
  readonly BITS_PER_SECOND: 'bits-per-second';
  readonly KILOBITS_PER_SECOND: 'kilobits-per-second';
  readonly MEGABITS_PER_SECOND: 'megabits-per-second';
  readonly GIGABITS_PER_SECOND: 'gigabits-per-second';
  readonly BYTES_PER_SECOND: 'bytes-per-second';
  readonly KILOBYTES_PER_SECOND: 'kilobytes-per-second';
  readonly MEGABYTES_PER_SECOND: 'megabytes-per-second';
  readonly GIGABYTES_PER_SECOND: 'gigabytes-per-second';
  readonly AQI: 'aqi';
  readonly PH: 'ph';
  readonly MILLIGRAM_PER_CUBIC_METER: 'milligram-per-cubic-meter';
  readonly MICROGRAM_PER_CUBIC_METER: 'microgram-per-cubic-meter';
  readonly NANOGRAM_PER_CUBIC_METER: 'nanogram-per-cubic-meter';
  readonly PARTICLES_PER_CUBIC_METER: 'particles-per-cubic-meter';
  readonly BECQUEREL_PER_CUBIC_METER: 'becquerel-per-cubic-meter';
  readonly DECIBEL: 'decibel';
};

/** WebSocket message types of the integration protocol (contract C.4). */
export declare const WEBSOCKET_MESSAGE_TYPES: {
  AUTHENTICATE: { INTEGRATION_REQUEST: string };
  AUTHENTICATION: { CONNECTED: string };
  EXTERNAL_INTEGRATION: {
    DEVICE_SET_VALUE: string;
    DEVICE_POLL: string;
    COMMAND_RESULT: string;
    SCAN_REQUEST: string;
    DEVICE_CREATED: string;
    DEVICE_UPDATED: string;
    DEVICE_DELETED: string;
    CONFIG_UPDATED: string;
    HEARTBEAT: string;
  };
};

/**
 * Client of the Gladys host API + integration WebSocket. See the README for a
 * complete example.
 */
export declare class GladysIntegration extends EventEmitter {
  constructor(options?: GladysIntegrationOptions);

  /** Integration selector (from options or GLADYS_INTEGRATION_SELECTOR). */
  readonly selector: string;
  /** Host API base URL, without trailing slash. */
  readonly hostApiUrl: string;
  /** Logger used for the connection lifecycle logs. */
  readonly logger: Logger;
  /** Devices of the integration created by the user (refreshed on every (re)connection). */
  devices: Device[];
  /** Configuration values (refreshed on every (re)connection and on config-updated). */
  config: IntegrationConfig;
  /** True while the WebSocket is authenticated. */
  connected: boolean;

  /**
   * Open the WebSocket, authenticate, resynchronize (GET /device + GET /config),
   * then resolve. Reconnects automatically for life with exponential backoff
   * min(1s * 2^n, 60s); every reconnection re-authenticates and resynchronizes.
   * A token refused by Gladys (close code 4000) keeps the loop armed but jumps
   * straight to the max delay — the refusal may be transient. connect() rejects
   * when the refusal happens during the initial connection.
   */
  connect(): Promise<void>;

  /** Close the connection cleanly and stop reconnecting. */
  disconnect(): Promise<void>;

  /** Build a namespaced external id: `ext:<selector>:<suffix>`. */
  externalId(suffix: string): string;

  /**
   * Build the external ids of ONE physical device: its device id and a factory
   * for its feature ids. `platformId` must be the unique id the external
   * platform gives you (serial, cloud id, Zigbee IEEE address, MAC…), never a
   * hard-coded label.
   */
  externalIds(type: string, platformId: string): DeviceExternalIds;

  /**
   * Exit gracefully on SIGTERM/SIGINT (sent by the supervisor when the
   * container stops): run the optional cleanup, disconnect cleanly, then exit
   * with code 0.
   */
  handleShutdown(cleanup?: (signal: 'SIGTERM' | 'SIGINT') => void | Promise<void>): void;

  /** Publish the complete list of discovered devices (replaces the previous one). */
  publishDiscoveredDevices(devices: Device[]): Promise<PublishDiscoveredDevicesResponse>;

  /** Fetch the devices created by the user; also refreshes `devices`. */
  getDevices(): Promise<Device[]>;

  /**
   * Publish one device feature state: a number, `{ text }` for a text state, or
   * `{ state, created_at }` for a past state.
   */
  publishState(
    featureExternalId: string,
    value: number | { text: string } | { state: number; created_at?: string | Date },
  ): Promise<SuccessResponse>;

  /** Publish a batch of states (max 100 per request). */
  publishStates(states: DeviceState[]): Promise<SuccessResponse>;

  /** Fetch the configuration (secrets included); also refreshes `config`. */
  getConfig(): Promise<IntegrationConfig>;

  /** Save configuration values (partial merge). */
  setConfig(partialConfig: IntegrationConfig): Promise<SuccessResponse>;

  /** Fetch the Gladys version and the integration service status. */
  getStatus(): Promise<IntegrationStatus>;

  /** Handler called when the user actions a device feature (auto-acked). */
  onSetValue(callback: (device: Device, deviceFeature: DeviceFeature, value: number) => void | Promise<void>): void;

  /** Handler called when the Gladys scheduler asks to poll a device (auto-acked). */
  onPoll(callback: (device: Device) => void | Promise<void>): void;

  /** Handler called when the user asks for a device scan. */
  onScanRequest(callback: () => void | Promise<void>): void;

  /** Handler called when the user creates one of the discovered devices. */
  onDeviceCreated(callback: (device: Device) => void | Promise<void>): void;

  /** Handler called when the user updates one of the integration devices. */
  onDeviceUpdated(callback: (device: Device) => void | Promise<void>): void;

  /** Handler called when the user deletes one of the integration devices. */
  onDeviceDeleted(callback: (device: Device) => void | Promise<void>): void;

  /** Handler called when the user saves the configuration form. */
  onConfigUpdated(callback: (config: IntegrationConfig) => void | Promise<void>): void;

  on(event: 'connected' | 'disconnected', listener: () => void): this;
  once(event: 'connected' | 'disconnected', listener: () => void): this;
}
