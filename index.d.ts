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
 * Multi-language message, keyed by language code. The `en` key is the
 * fallback shown when the user language is missing.
 */
export type MultiLanguageMessage = { en: string } & Record<string, string>;

/** A published port of a sub-container, with the host port assigned by Gladys. */
export interface ContainerPort {
  container_port: number;
  host_port: number;
}

/** State of one requested hardware class of a sub-container (contract C.3). */
export interface ContainerHardwareDevice {
  /** Hardware class name, e.g. 'coral-usb', 'gpu'. */
  class: string;
  /** Whether the user granted the class. */
  granted: boolean;
  /** Whether the hardware is detected on the host. */
  available: boolean;
}

/** A sub-container declared in the manifest, as returned by GET /container. */
export interface IntegrationContainer {
  name: string;
  /** Docker status, e.g. 'running' | 'stopped'. */
  status: string;
  /** Desired state kept by the supervisor, e.g. 'running' | 'stopped'. */
  desired: string;
  started_at: string | null;
  ports: ContainerPort[];
  devices?: ContainerHardwareDevice[];
  [key: string]: unknown;
}

/** Payload entry of the hardware-updated event (contract C.4). */
export interface HardwareUpdatedContainer {
  name: string;
  devices: ContainerHardwareDevice[];
}

/** Capture types of the manifest `network_discovery` field (contract B.16). */
export type NetworkDiscoveryType = 'udp-broadcast' | 'mdns' | 'ssdp';

/** Options of a mediated network scan. */
export interface NetworkScanOptions {
  /** Scan duration in seconds (1-30). */
  timeoutSeconds?: number;
}

/** Raw result of a 'udp-broadcast' mediated scan: one received datagram. */
export interface UdpBroadcastScanResult {
  source_ip: string;
  source_port: number;
  payload_base64: string;
}

/** Raw result of an 'mdns' mediated scan: one browsed service instance. */
export interface MdnsScanResult {
  name: string;
  host: string;
  addresses: string[];
  port: number;
  txt: Record<string, string>;
}

/** Raw result of an 'ssdp' mediated scan: the raw headers of one responder. */
export type SsdpScanResult = Record<string, string>;

/** Values of the `fields` mini-form of a manifest action (contract C.1). */
export type ActionFields = Record<string, unknown>;

/**
 * A message Gladys asks a communication integration to deliver in the
 * external channel (contract B.15).
 */
export interface OutgoingMessage {
  text: string;
  /** Attached image as a base64 string, or null. */
  file: string | null;
}

/** A Gladys user linked to an external contact (contract B.15). */
export interface LinkedUser {
  selector: string;
  first_name: string;
  language: string;
}

/** A linked contact of a communication integration, as returned by GET /contact. */
export interface LinkedContact {
  /** Id of the contact in the external channel. */
  contact_id: string;
  contact_name: string | null;
  /** ISO date of the linking. */
  linked_at: string | null;
  user: LinkedUser | null;
}

/**
 * Per-device transport status (contract C.3), stored in the reserved
 * GLADYS_TRANSPORT device param and rendered as a badge in the Gladys UI.
 */
export type DeviceTransport = 'local' | 'cloud' | 'unreachable';

/** One entry of the publishTransports batch. */
export interface DeviceTransportEntry {
  /** The device external_id. */
  external_id: string;
  transport: DeviceTransport;
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
    HARDWARE_UPDATED: string;
    OAUTH_GET_AUTHORIZE_URL: string;
    OAUTH_CALLBACK: string;
    ACTION_RUN: string;
    CAMERA_GET_IMAGE: string;
    MESSAGE_SEND: string;
    HEARTBEAT: string;
  };
};

/** Values of the per-device transport status (contract C.3). */
export declare const DEVICE_TRANSPORTS: {
  readonly LOCAL: 'local';
  readonly CLOUD: 'cloud';
  readonly UNREACHABLE: 'unreachable';
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

  /**
   * Publish a new image of a camera device of the integration (a device
   * carrying a `camera`/`image` feature): the dashboard camera widget updates
   * in real time. `image` is an `image/jpg;base64,...` string, limited to
   * 150 KB and 12 images/minute per device — a dedicated channel, out of the
   * states history and rate limit.
   */
  publishCameraImage(deviceExternalId: string, image: string): Promise<SuccessResponse>;

  /**
   * Publish the per-device transport status ('local' | 'cloud' |
   * 'unreachable', max 100 per request), rendered as a badge on the devices in
   * the Gladys UI in real time — the lightweight path for live switches, no
   * need to re-publish the discovered devices. The matching user preference
   * arrives in `gladys.config.GLADYS_PREFER_LOCAL`.
   */
  publishTransports(transports: DeviceTransportEntry[]): Promise<SuccessResponse>;

  /**
   * Publish a message received in the external channel (communication
   * integrations, contract B.15): Gladys resolves the contact to the linked
   * user and routes the message to the brain, the chat history and the
   * answering machinery — replies come back through `onSendMessage`. An
   * unknown (not linked) contact is rejected with a 404 `GladysApiError`.
   */
  publishMessage(contactId: string, text: string, options?: { createdAt?: string | Date }): Promise<SuccessResponse>;

  /**
   * Link an external contact to a Gladys user (communication integrations,
   * contract B.15). The code proves the consent: generated by the user from
   * the Gladys UI (single use, 15 minutes TTL) and sent to the bot in the
   * external channel. Resolves with the linked user; an invalid or expired
   * code is rejected with a 404 `GladysApiError`.
   */
  linkContact(code: string, contactId: string, contactName?: string): Promise<LinkedUser>;

  /** Fetch the contacts linked to the integration, with their linked Gladys user. */
  getContacts(): Promise<LinkedContact[]>;

  /** Fetch the configuration (secrets included); also refreshes `config`. */
  getConfig(): Promise<IntegrationConfig>;

  /** Save configuration values (partial merge). */
  setConfig(partialConfig: IntegrationConfig): Promise<SuccessResponse>;

  /** Fetch the Gladys version and the integration service status. */
  getStatus(): Promise<IntegrationStatus>;

  /**
   * Publish the application-level connection status of the integration, shown
   * in the Configuration screen (e.g. "token expired, please reconnect"). A
   * cloud integration can be RUNNING and still disconnected from its
   * third-party service — without this channel it would be silently broken.
   */
  setConnectionStatus(connected: boolean, message?: MultiLanguageMessage): Promise<SuccessResponse>;

  /**
   * Fetch the sub-containers declared in the manifest: Docker status, desired
   * state, assigned host ports and granted/available hardware classes.
   */
  getContainers(): Promise<IntegrationContainer[]>;

  /**
   * Create (if needed) and start a sub-container declared in the manifest —
   * typically after generating its config files in `/data`. The optional `env`
   * carries runtime-computed values, merged over the manifest env.
   */
  startContainer(name: string, options?: { env?: Record<string, string> }): Promise<SuccessResponse>;

  /** Stop a sub-container; the supervisor will not restart it. */
  stopContainer(name: string): Promise<SuccessResponse>;

  /** Restart a sub-container, e.g. after rewriting its config through `/data`. */
  restartContainer(name: string): Promise<SuccessResponse>;

  /**
   * Run an on-demand mediated network scan: the core — on the host network —
   * captures what the manifest `network_discovery` field declares (bridge
   * containers never receive LAN broadcast/mDNS/SSDP) and returns the RAW
   * results. Parse them yourself, join the devices through unicast, then
   * publish them with `publishDiscoveredDevices`. Undeclared type/ports → 403.
   */
  scanNetwork(type: 'udp-broadcast', options?: NetworkScanOptions): Promise<UdpBroadcastScanResult[]>;
  scanNetwork(type: 'mdns', options?: NetworkScanOptions): Promise<MdnsScanResult[]>;
  scanNetwork(type: 'ssdp', options?: NetworkScanOptions): Promise<SsdpScanResult[]>;
  scanNetwork(type: string, options?: NetworkScanOptions): Promise<unknown[]>;

  /** Handler called when the user actions a device feature (auto-acked). */
  onSetValue(callback: (device: Device, deviceFeature: DeviceFeature, value: number) => void | Promise<void>): void;

  /** Handler called when the Gladys scheduler asks to poll a device (auto-acked). */
  onPoll(callback: (device: Device) => void | Promise<void>): void;

  /**
   * Handler called when Gladys needs a FRESH image of one of the integration
   * cameras — live view of the dashboard widget, chat intent (auto-acked).
   * Capture and resolve the image as an `image/jpg;base64,...` string
   * (≤ 150 KB): it is acked back as `data.image`, awaited under 15 s (not the
   * standard 5 s) so an ffmpeg-style capture fits.
   */
  onGetImage(callback: (device: Device) => string | Promise<string>): void;

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

  /**
   * Handler called when the user changes the hardware grants: the affected
   * sub-containers have been recreated — regenerate their configuration and
   * (re)start what is needed.
   */
  onHardwareUpdated(callback: (containers: HardwareUpdatedContainer[]) => void | Promise<void>): void;

  /**
   * Handler called when the user clicks "Connect" on an `oauth2` config field
   * (auto-acked): build and return the provider authorization URL — client_id
   * from the config, scopes, a `state` you generate and remember. The resolved
   * string is acked as `data.authorize_url`.
   */
  onOAuthAuthorizeUrl(callback: (key: string, redirectUri: string) => string | Promise<string>): void;

  /**
   * Handler called when the OAuth2 provider redirects back (auto-acked):
   * verify `state`, exchange the code for the tokens, store them through
   * `setConfig` (keys outside the config_schema), then
   * `setConnectionStatus(true)`.
   */
  onOAuthCallback(
    callback: (key: string, params: { code: string; state: string; redirectUri: string }) => void | Promise<void>,
  ): void;

  /**
   * Handler called when Gladys asks a communication integration to deliver a
   * message in the external channel (auto-acked) — a reply of the brain, or a
   * notification forwarded to a linked user.
   */
  onSendMessage(callback: (contactId: string, message: OutgoingMessage) => void | Promise<void>): void;

  /**
   * Handler of ONE action declared in the manifest `actions` field, run when
   * the user clicks its button in the Configuration screen (auto-acked).
   * Registered per action `key`; receives the values of the action `fields`
   * mini-form. The resolved value (string or multi-language object) is acked
   * back as `data.message` and shown under the button. The ack is awaited
   * under the action's declared `timeout_seconds` (not the standard 5 s).
   */
  onAction(
    key: string,
    callback: (
      fields: ActionFields,
    ) => string | MultiLanguageMessage | void | Promise<string | MultiLanguageMessage | void>,
  ): void;

  on(event: 'connected' | 'disconnected', listener: () => void): this;
  once(event: 'connected' | 'disconnected', listener: () => void): this;
}
