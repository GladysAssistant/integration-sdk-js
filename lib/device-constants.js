/**
 * Standard Gladys device-feature constants — verbatim mirror of
 * DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES and DEVICE_FEATURE_UNITS in
 * server/utils/constants.js of the Gladys repository, so integrations never
 * have to hand-copy (and typo) the canonical category/type/unit strings of
 * their discovery payloads.
 *
 * Keep the three objects byte-identical to the Gladys source: resyncing is
 * then a plain copy/paste and the diff shows exactly what Gladys added.
 */

const DEVICE_FEATURE_CATEGORIES = {
  CHILD_LOCK: 'child-lock',
  AIRQUALITY_SENSOR: 'airquality-sensor',
  AIR_CONDITIONING: 'air-conditioning',
  ANGLE_SENSOR: 'angle-sensor',
  BATTERY: 'battery',
  BATTERY_LOW: 'battery-low',
  BUTTON: 'button',
  CAMERA: 'camera',
  CUBE: 'cube',
  CURRENCY: 'currency',
  CO_SENSOR: 'co-sensor',
  CO2_SENSOR: 'co2-sensor',
  COUNTER_SENSOR: 'counter-sensor',
  CURTAIN: 'curtain',
  DATA: 'data',
  DATARATE: 'datarate',
  DEVICE_TEMPERATURE_SENSOR: 'device-temperature-sensor',
  DISTANCE_SENSOR: 'distance-sensor',
  DURATION: 'duration',
  ELECTRICAL_VEHICLE_BATTERY: 'electrical-vehicle-battery',
  ELECTRICAL_VEHICLE_CHARGE: 'electrical-vehicle-charge',
  ELECTRICAL_VEHICLE_DRIVE: 'electrical-vehicle-drive',
  ELECTRICAL_VEHICLE_CONSUMPTION: 'electrical-vehicle-consumption',
  ELECTRICAL_VEHICLE_STATE: 'electrical-vehicle-state',
  ELECTRICAL_VEHICLE_CLIMATE: 'electrical-vehicle-climate',
  ELECTRICAL_VEHICLE_COMMAND: 'electrical-vehicle-command',
  ENERGY_SENSOR: 'energy-sensor',
  ENERGY_PRODUCTION_SENSOR: 'energy-production-sensor',
  GRID_SENSOR: 'grid-sensor',
  HOME_OUTPUT_SENSOR: 'home-output-sensor',
  FAN: 'fan',
  HEATER: 'heater',
  HEPA_FILTER_MONITORING: 'hepa-filter-monitoring',
  HUMIDITY_SENSOR: 'humidity-sensor',
  LEAK_SENSOR: 'leak-sensor',
  LIGHT: 'light',
  LIGHT_SENSOR: 'light-sensor',
  LEVEL_SENSOR: 'level-sensor',
  MOTION_SENSOR: 'motion-sensor',
  LOCK: 'lock',
  MUSIC: 'music',
  NOISE_SENSOR: 'noise-sensor',
  OPENING_SENSOR: 'opening-sensor',
  ORP_SENSOR: 'orp-sensor',
  PH_SENSOR: 'ph-sensor',
  PM25_SENSOR: 'pm25-sensor',
  PM10_SENSOR: 'pm10-sensor',
  FORMALDEHYD_SENSOR: 'formaldehyd-sensor',
  PRECIPITATION_SENSOR: 'precipitation-sensor',
  PRESENCE_SENSOR: 'presence-sensor',
  PRESSURE_SENSOR: 'pressure-sensor',
  RAIN_SENSOR: 'rain-sensor',
  RISK: 'risk',
  SHUTTER: 'shutter',
  SIGNAL: 'signal',
  SIREN: 'siren',
  SISMIC_SENSOR: 'sismic-sensor',
  SMOKE_SENSOR: 'smoke-sensor',
  SOIL_MOISTURE_SENSOR: 'soil-moisture-sensor',
  SURFACE: 'surface',
  SWITCH: 'switch',
  SPEED_SENSOR: 'speed-sensor',
  TAMPER: 'tamper',
  TELEINFORMATION: 'teleinformation',
  TELEVISION: 'television',
  TEMPERATURE_SENSOR: 'temperature-sensor',
  THERMOSTAT: 'thermostat',
  UNKNOWN: 'unknown',
  UV_SENSOR: 'uv-sensor',
  VIBRATION_SENSOR: 'vibration-sensor',
  VOC_SENSOR: 'voc-sensor',
  VOC_INDEX_SENSOR: 'voc-index-sensor',
  VOC_MATTER_INDEX_SENSOR: 'voc-matter-index-sensor',
  NO2_MATTER_INDEX_SENSOR: 'no2-matter-index-sensor',
  VOLUME_SENSOR: 'volume-sensor',
  VACUUM_CLEANER: 'vacuum-cleaner',
  TEXT: 'text',
  INPUT: 'input',
};

const DEVICE_FEATURE_TYPES = {
  LIGHT: {
    BINARY: 'binary',
    BRIGHTNESS: 'brightness',
    HUE: 'hue',
    SATURATION: 'saturation',
    COLOR: 'color',
    TEMPERATURE: 'temperature',
    POWER: 'power',
    EFFECT_MODE: 'effect-mode',
    EFFECT_SPEED: 'effect-speed',
  },
  SENSOR: {
    DECIMAL: 'decimal',
    INTEGER: 'integer',
    BINARY: 'binary',
    PUSH: 'push',
    UNKNOWN: 'unknown',
  },
  TEMPERATURE_SENSOR: {
    MIN: 'min',
    MAX: 'max',
    AVERAGE: 'average',
  },
  SWITCH: {
    BINARY: 'binary',
    POWER: 'power',
    ENERGY: 'energy',
    VOLTAGE: 'voltage',
    CURRENT: 'current',
    BURGLAR: 'burglar',
    DIMMER: 'dimmer',
    TARGET_CURRENT: 'target-current',
  },
  LOCK: {
    BINARY: 'binary',
    INTEGER: 'integer',
    STATE: 'state',
  },
  CAMERA: {
    IMAGE: 'image',
  },
  SIREN: {
    BINARY: 'binary',
    LMH_VOLUME: 'lmh_volume',
    MELODY: 'melody',
  },
  CHILD_LOCK: {
    BINARY: 'binary',
  },
  CUBE: {
    MODE: 'mode',
    ROTATION: 'rotation',
  },
  BATTERY: {
    INTEGER: 'integer',
  },
  BATTERY_LOW: {
    BINARY: 'binary',
  },
  VIBRATION_SENSOR: {
    BINARY: 'binary',
    STATUS: 'status',
    TILT_ANGLE: 'tilt-angle',
    ACCELERATION_X: 'acceleration-x',
    ACCELERATION_Y: 'acceleration-y',
    ACCELERATION_Z: 'acceleration-z',
    ANGLE_X: 'angle-x',
    ANGLE_Y: 'angle-y',
    ANGLE_Z: 'angle-z',
    BED_ACTIVITY: 'bed-activity',
  },
  BUTTON: {
    CLICK: 'click',
    PUSH: 'push',
  },
  SIGNAL: {
    QUALITY: 'integer',
  },
  AIR_CONDITIONING: {
    BINARY: 'binary',
    MODE: 'mode',
    TARGET_TEMPERATURE: 'target-temperature',
  },
  FAN: {
    MODE: 'mode',
    PERCENT: 'percent',
    SPEED: 'speed',
    AIRFLOW_DIRECTION: 'airflow-direction',
    ROCK_SETTING: 'rock-setting',
    WIND_SETTING: 'wind-setting',
  },
  HEATER: {
    PILOT_WIRE_MODE: 'pilot-wire-mode',
  },
  SURFACE: {
    DECIMAL: 'decimal',
  },
  TAMPER: {
    BINARY: 'binary',
  },
  TELEVISION: {
    BINARY: 'binary',
    SOURCE: 'source',
    GUIDE: 'guide',
    MENU: 'menu',
    TOOLS: 'tools',
    INFO: 'info',
    ENTER: 'enter',
    RETURN: 'return',
    EXIT: 'exit',
    LEFT: 'left',
    RIGHT: 'right',
    UP: 'up',
    DOWN: 'down',
    CHANNEL_UP: 'channel-up',
    CHANNEL_DOWN: 'channel-down',
    CHANNEL_PREVIOUS: 'channel-previous',
    CHANNEL: 'channel',
    VOLUME_UP: 'volume-up',
    VOLUME_DOWN: 'volume-down',
    VOLUME_MUTE: 'volume-mute',
    VOLUME: 'volume',
    PLAY: 'play',
    PAUSE: 'pause',
    STOP: 'stop',
    PREVIOUS: 'previous',
    NEXT: 'next',
    REWIND: 'rewind',
    FORWARD: 'forward',
    RECORD: 'record',
  },
  MUSIC: {
    VOLUME: 'volume',
    PLAY: 'play',
    PAUSE: 'pause',
    PREVIOUS: 'previous',
    NEXT: 'next',
    PLAYBACK_STATE: 'playback_state',
    PLAY_NOTIFICATION: 'play_notification',
  },
  ENERGY_SENSOR: {
    BINARY: 'binary',
    POWER: 'power',
    ENERGY: 'energy',
    VOLTAGE: 'voltage',
    CURRENT: 'current',
    INDEX: 'index',
    INDEX_TODAY: 'index-today',
    INDEX_YESTERDAY: 'index-yesterday',
    DAILY_CONSUMPTION: 'daily-consumption',
    DAILY_CONSUMPTION_COST: 'daily-consumption-cost',
    THIRTY_MINUTES_CONSUMPTION: 'thirty-minutes-consumption',
    THIRTY_MINUTES_CONSUMPTION_COST: 'thirty-minutes-consumption-cost',
  },
  ENERGY_PRODUCTION_SENSOR: {
    POWER: 'power', // instantaneous production power, in W (>= 0)
    INDEX: 'index',
    DAILY_PRODUCTION: 'daily-production',
    DAILY_PRODUCTION_REVENUE: 'daily-production-revenue',
    THIRTY_MINUTES_PRODUCTION: 'thirty-minutes-production',
    THIRTY_MINUTES_PRODUCTION_REVENUE: 'thirty-minutes-production-revenue',
  },
  GRID_SENSOR: {
    INPUT_POWER: 'input-power', // Instantaneous power imported from the grid, in W (>= 0)
    OUTPUT_POWER: 'output-power', // Instantaneous power exported to the grid, in W (>= 0)
    POWER: 'power', // Signed grid exchange when the device reports a single value (import > 0, export < 0), in W
    INPUT_INDEX: 'input-index', // Cumulative imported-energy meter index, in kWh (>= 0)
    OUTPUT_INDEX: 'output-index', // Cumulative exported-energy meter index, in kWh (>= 0)
  },
  HOME_OUTPUT_SENSOR: {
    POWER: 'power', // Instantaneous power delivered to the home, in W (>= 0)
    INDEX: 'index', // Cumulative delivered-energy meter index, in kWh (>= 0)
    OFF_GRID_POWER: 'off-grid-power', // Instantaneous power on the backup/off-grid output, in W (>= 0)
    OFF_GRID_INDEX: 'off-grid-index', // Cumulative backup-output energy meter index, in kWh (>= 0)
  },
  TELEINFORMATION: {
    BINARY: 'binary',
    EAST: 'east',
    EAIT: 'eait',
    EASF01: 'easf01',
    EASF02: 'easf02',
    EASF03: 'easf03',
    EASF04: 'easf04',
    EASF05: 'easf05',
    EASF06: 'easf06',
    EASF07: 'easf07',
    EASF08: 'easf08',
    EASF09: 'easf09',
    EASF10: 'easf10',
    PREF: 'pref',
    PCOUP: 'pcoup',
    VTIC: 'vtic',
    CCASN: 'ccasn',
    CCASN_1: 'ccasn_1',
    UMOY1: 'umoy1',
    UMOY2: 'umoy2',
    UMOY3: 'umoy3',
    ERQ1: 'erq1',
    ERQ2: 'erq2',
    ERQ3: 'erq3',
    ERQ4: 'erq4',
    IRMS1: 'irms1',
    IRMS2: 'irms2',
    IRMS3: 'irms3',
    URMS1: 'urms1',
    URMS2: 'urms2',
    URMS3: 'urms3',
    EASD01: 'easd01',
    EASD02: 'easd02',
    EASD03: 'easd03',
    EASD04: 'easd04',
    NTARF: 'ntarf',
    CCAIN: 'ccain',
    CCAIN_1: 'ccain_1',
    SINSTI: 'sinsti',
    SMAXIN: 'smaxin',
    SMAXIN_1: 'smaxin_1',
    SMAXN: 'smaxn',
    SMAXN2: 'smaxn2',
    SMAXN3: 'smaxn3',
    SINSTS: 'sinsts',
    SINSTS2: 'sinsts2',
    SINSTS3: 'sinsts3',
    SMAXN_1: 'smaxn_1',
    SMAXN2_1: 'smaxn2_1',
    SMAXN3_1: 'smaxn3_1',
    HHPHC: 'hhphc',
    IMAX: 'imax',
    ADPS: 'adps',
    IMAX2: 'imax2',
    IMAX3: 'imax3',
    ADIR1: 'adir1',
    ADIR2: 'adir2',
    ADIR3: 'adir3',
  },
  SPEED_SENSOR: {
    DECIMAL: 'decimal',
    INTEGER: 'integer',
  },
  UV_SENSOR: {
    INTEGER: 'integer',
  },
  CURRENCY: {
    DECIMAL: 'decimal',
  },
  PRECIPITATION_SENSOR: {
    DECIMAL: 'decimal',
    INTEGER: 'integer',
  },
  VOLUME_SENSOR: {
    DECIMAL: 'decimal',
    INTEGER: 'integer',
  },
  DURATION: {
    DECIMAL: 'decimal',
    INTEGER: 'integer',
  },
  VOC_SENSOR: {
    DECIMAL: 'decimal',
  },
  VOC_INDEX_SENSOR: {
    INTEGER: 'integer',
  },
  SHUTTER: {
    STATE: 'state',
    POSITION: 'position',
  },
  CURTAIN: {
    STATE: 'state',
    POSITION: 'position',
  },
  DATA: {
    SIZE: 'size',
  },
  DATARATE: {
    RATE: 'rate',
  },
  UNKNOWN: {
    UNKNOWN: 'unknown',
  },
  THERMOSTAT: {
    TARGET_TEMPERATURE: 'target-temperature',
  },
  AIRQUALITY_SENSOR: {
    AQI: 'aqi',
  },
  PH_SENSOR: {
    DECIMAL: 'decimal',
  },
  ORP_SENSOR: {
    DECIMAL: 'decimal',
  },
  TEXT: {
    TEXT: 'text',
  },
  RISK: {
    INTEGER: 'integer',
  },
  INPUT: {
    BINARY: 'binary',
  },
  LEVEL_SENSOR: {
    // Types used by the Tuya ME201WZ in Zigbee2mqtt
    LIQUID_STATE: 'liquid-state',
    LIQUID_LEVEL_PERCENT: 'liquid-level-percent',
    LIQUID_DEPTH: 'liquid-depth',
  },
  ELECTRICAL_VEHICLE_BATTERY: {
    // Features related to the battery state and metrics of the vehicle
    BATTERY_ENERGY_REMAINING: 'battery-energy-remaining', // Remaining energy in the battery in kWh (integer - sensor)
    BATTERY_LEVEL: 'battery-level', // Battery state of charge in percent (integer - sensor)
    BATTERY_POWER: 'battery-power', // Instantaneous battery power in W (integer - sensor)
    BATTERY_RANGE_ESTIMATE: 'battery-range-estimate', // Estimated remaining range in km or miles (integer - sensor)
    BATTERY_TEMPERATURE: 'battery-temperature', // Battery temperature in °C (integer - sensor)
    BATTERY_VOLTAGE: 'battery-voltage', // Battery voltage in V (integer - sensor)
  },
  ELECTRICAL_VEHICLE_CHARGE: {
    // Features related to the charging process and charge control
    CHARGE_CURRENT: 'charge-current', // Current delivered during charging in A (integer - sensor)
    CHARGE_ENERGY_ADDED_TOTAL: 'charge-energy-added-total', // Total energy added during all charge sessions in kWh (integer - sensor)
    CHARGE_ENERGY_CONSUMPTION_TOTAL: 'charge-energy-consumption-total', // Total energy consumed during all charge sessions in kWh (integer - sensor)
    CHARGE_ON: 'charge-on', // Charging state (binary - command with return status)
    CHARGE_POWER: 'charge-power', // Instantaneous charging power in W (integer - sensor)
    CHARGE_VOLTAGE: 'charge-voltage', // Charging voltage in V (integer - sensor)
    LAST_CHARGE_ENERGY_ADDED: 'last-charge-energy-added', // Energy added in the last charge session in kWh (integer - sensor)
    LAST_CHARGE_ENERGY_CONSUMPTION: 'last-charge-energy-consumption', // Energy consumed in the last charge session in kWh (integer - sensor)
    PLUGGED: 'plugged', // Whether the vehicle is plugged in (binary - sensor)
    TARGET_CHARGE_LIMIT: 'target-charge-limit', // Target state of charge limit in percent (integer - command)
    TARGET_CURRENT: 'target-current', // Target charging current in A (integer - command)
  },
  ELECTRICAL_VEHICLE_CLIMATE: {
    // Features related to the vehicle's climate control
    CLIMATE_ON: 'climate-on', // Climate system activation (binary - command with return status)
    INDOOR_TEMPERATURE: 'indoor-temperature', // Cabin temperature in °C (integer - sensor)
    TARGET_TEMPERATURE: 'target-temperature', // Desired cabin temperature in °C (integer - command)
  },
  ELECTRICAL_VEHICLE_COMMAND: {
    // General remote commands for the vehicle
    ALARM: 'alarm', // Enable/Disable alarm (binary - command with return status)
    LOCK: 'lock', // Lock/unlock the vehicle (binary - command with return status)
  },
  ELECTRICAL_VEHICLE_DRIVE: {
    // Features related to driving and trip statistics
    DRIVE_ENERGY_CONSUMPTION_TOTAL: 'drive-energy-consumption-total', // Total energy consumed while all trips in kWh (integer - sensor)
    SPEED: 'speed', // Current speed of the vehicle in km/h or mi/h (integer - sensor)
  },
  ELECTRICAL_VEHICLE_CONSUMPTION: {
    // Features related to energy consumption and efficiency
    ENERGY_CONSUMPTION: 'energy-consumption', // Instantaneous or average energy consumption in Wh/km, Wh/mi, kWh/100km, kWh/100mi (integer - sensor)
    ENERGY_EFFICIENCY: 'energy-efficiency', // Energy efficiency metric in km/kWh or mi/kWh (integer - sensor)
  },
  ELECTRICAL_VEHICLE_STATE: {
    // Features related to the physical state of the vehicle
    DOOR_OPENED: 'door-opened', // Door open state (binary - sensor)
    ODOMETER: 'odometer', // Total distance traveled in km or miles (integer - sensor)
    TIRE_PRESSURE: 'tire-pressure', // Tire pressure in bar (decimal - sensor)
    WINDOW_OPENED: 'window-opened', // Window open state (binary - sensor)
  },
  FILTER_MONITORING: {
    FILTER_LIFE_REMAINING: 'filter-life-remaining', // Remaining life of the HEPA filter in percent (integer - sensor)
  },
  VACUUM_CLEANER: {
    STATE: 'state', // Operational state of the vacuum (integer - sensor)
    RUN_MODE: 'run-mode', // Run mode of the vacuum (integer - command)
    CLEAN_MODE: 'clean-mode', // Clean mode of the vacuum (integer - command)
    DOCK: 'dock', // Send vacuum to dock (binary - command)
  },
};

const DEVICE_FEATURE_UNITS = {
  // Temperature units
  CELSIUS: 'celsius',
  FAHRENHEIT: 'fahrenheit',
  KELVIN: 'kelvin',
  // Percentage units
  PERCENT: 'percent',
  // Pressure units
  PASCAL: 'pascal',
  HECTO_PASCAL: 'hPa',
  KILO_PASCAL: 'kPa',
  BAR: 'bar',
  PSI: 'psi',
  MILLIBAR: 'milli-bar',
  // Light units
  LUX: 'lux',
  // Concentration units
  PPM: 'ppm',
  PPB: 'ppb',
  PPT: 'ppt',
  // Power units
  WATT: 'watt',
  KILOWATT: 'kilowatt',
  WATT_HOUR: 'watt-hour',
  KILOWATT_HOUR: 'kilowatt-hour',
  MEGAWATT_HOUR: 'megawatt-hour',
  AMPERE: 'ampere',
  MILLI_AMPERE: 'milliampere',
  MILLI_VOLT: 'millivolt',
  VOLT: 'volt',
  KILOVOLT_AMPERE: 'kilovolt-ampere',
  VOLT_AMPERE: 'volt-ampere',
  VOLT_AMPERE_REACTIVE: 'volt-ampere-reactive',
  WATT_HOUR_PER_KM: 'watt-hour-per-km',
  KILOWATT_HOUR_PER_100_KM: 'kilowatt-hour-per-100-km',
  WATT_HOUR_PER_MILE: 'watt-hour-per-mile',
  KILOWATT_HOUR_PER_100_MILE: 'kilowatt-hour-per-100-mile',
  // Efficiency units
  KM_PER_KILOWATT_HOUR: 'km-per-kilowatt-hour',
  MILE_PER_KILOWATT_HOUR: 'mile-per-kilowatt-hour',
  // Length units
  MM: 'mm',
  CM: 'cm',
  M: 'm',
  KM: 'km',
  INCH: 'inch',
  FEET: 'feet',
  MILE: 'mile',
  // surface units
  SQUARE_CENTIMETER: 'square-centimeter',
  SQUARE_METER: 'square-meter',
  SQUARE_KILOMETER: 'square-kilometer',
  // Degree units
  DEGREE: 'degree',
  // Volume units
  LITER: 'liter',
  MILLILITER: 'milliliter',
  CUBIC_METER: 'cubicmeter',
  // Currency units
  EURO: 'euro',
  DOLLAR: 'dollar',
  BITCOIN: 'bitcoin',
  LITECOIN: 'litecoin',
  DOGECOIN: 'dogecoin',
  ETHEREUM: 'ethereum',
  POUND_STERLING: 'pound-sterling',
  // Speed units
  METER_PER_SECOND: 'meter-per-second',
  KILOMETER_PER_HOUR: 'kilometer-per-hour',
  FEET_PER_SECOND: 'feet-per-second',
  MILE_PER_HOUR: 'mile-per-hour',
  // Precipitation units
  MILLIMETER_PER_HOUR: 'millimeter-per-hour',
  MILLIMETER_PER_DAY: 'millimeter-per-day',
  // UV units
  UV_INDEX: 'uv-index',
  // Duration units
  MICROSECONDS: 'microseconds',
  MILLISECONDS: 'milliseconds',
  SECONDS: 'seconds',
  MINUTES: 'minutes',
  HOURS: 'hours',
  DAYS: 'days',
  WEEKS: 'weeks',
  MONTHS: 'months',
  YEARS: 'years',
  // Data units
  BIT: 'bit',
  KILOBIT: 'kilobit',
  MEGABIT: 'megabit',
  GIGABIT: 'gigabit',
  BYTE: 'byte',
  KILOBYTE: 'kilobyte',
  MEGABYTE: 'megabyte',
  GIGABYTE: 'gigabyte',
  TERABYTE: 'terabyte',
  // Data rate units
  BITS_PER_SECOND: 'bits-per-second',
  KILOBITS_PER_SECOND: 'kilobits-per-second',
  MEGABITS_PER_SECOND: 'megabits-per-second',
  GIGABITS_PER_SECOND: 'gigabits-per-second',
  BYTES_PER_SECOND: 'bytes-per-second',
  KILOBYTES_PER_SECOND: 'kilobytes-per-second',
  MEGABYTES_PER_SECOND: 'megabytes-per-second',
  GIGABYTES_PER_SECOND: 'gigabytes-per-second',
  // Airquality Index
  AQI: 'aqi',
  // Water quality
  PH: 'ph',
  // For air quality (pm2.5, pm10, formaldehyd)
  MILLIGRAM_PER_CUBIC_METER: 'milligram-per-cubic-meter',
  MICROGRAM_PER_CUBIC_METER: 'microgram-per-cubic-meter',
  NANOGRAM_PER_CUBIC_METER: 'nanogram-per-cubic-meter',
  PARTICLES_PER_CUBIC_METER: 'particles-per-cubic-meter',
  BECQUEREL_PER_CUBIC_METER: 'becquerel-per-cubic-meter',
  // Noise units
  DECIBEL: 'decibel',
};

module.exports = {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
};
