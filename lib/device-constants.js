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
  BATTERY_STORAGE: 'battery-storage',
  BUTTON: 'button',
  CAMERA: 'camera',
  CHARGING_STATION: 'charging-station',
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
  DOORBELL: 'doorbell',
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
  FAN: 'fan',
  GRID_SENSOR: 'grid-sensor',
  HEATER: 'heater',
  HEPA_FILTER_MONITORING: 'hepa-filter-monitoring',
  HOME_OUTPUT_SENSOR: 'home-output-sensor',
  HUMIDITY_SENSOR: 'humidity-sensor',
  LEAK_SENSOR: 'leak-sensor',
  LIGHT: 'light',
  LIGHT_SENSOR: 'light-sensor',
  LEVEL_SENSOR: 'level-sensor',
  MOTION_SENSOR: 'motion-sensor',
  LOCK: 'lock',
  // Generic consumable/wear-part monitoring (vacuum brushes, dust bags, mop pads, softener resin,
  // detergent...). One feature per component, the feature `name` identifies the component: don't
  // add a new per-component type/category here when the value is just "remaining life in percent".
  // Boundary with neighboring categories: filter life reported through the Matter Resource
  // Monitoring model (HEPA and activated carbon filters) stays in HEPA_FILTER_MONITORING, every
  // other consumable or wear part goes here, so the same quantity is never split across categories.
  // The name `maintenance` is deliberate: it is a user-facing category name in the UI, kept broader
  // and simpler than a Matter-style `consumable-monitoring`. Renaming it later would be breaking.
  MAINTENANCE: 'maintenance',
  MUSIC: 'music',
  NOISE_SENSOR: 'noise-sensor',
  OPENING_SENSOR: 'opening-sensor',
  ORP_SENSOR: 'orp-sensor',
  PH_SENSOR: 'ph-sensor',
  PM25_SENSOR: 'pm25-sensor',
  PM10_SENSOR: 'pm10-sensor',
  FORMALDEHYD_SENSOR: 'formaldehyd-sensor',
  // Gaseous air pollutants, one category per gas, holding the raw mass concentration measured in
  // the air (µg/m³ by default, non-negative). Boundary with the neighbouring air quality
  // categories: an index synthesizing several pollutants goes to `airquality-sensor`, and a
  // protocol-specific severity level (Matter reports these gases as a 0-4 LevelValue, see
  // `no2-matter-index-sensor`) is not a concentration and must not be published here. Whichever
  // form the device natively reports is the one the integration maps, never both for the same
  // measurement.
  NO2_SENSOR: 'no2-sensor',
  O3_SENSOR: 'o3-sensor',
  SO2_SENSOR: 'so2-sensor',
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
  WATER_HEATER: 'water-heater',
  WATER_VALVE: 'water-valve',
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
    // ENABLED (spec docs/specs/camera-enable-disable.md): binary read/write gate telling Gladys
    // whether it may use this camera. 1 = enabled (default), 0 = disabled: Gladys stops polling
    // the camera, refuses to start a live stream and stops serving its image (dashboard, chat,
    // scenes) — a "private mode" that does not delete the camera. A camera without this feature
    // is always considered enabled, so cameras created before it existed keep working.
    // Boundary: this is a Gladys-side gate, not the camera's power supply (that stays a `switch`
    // feature on the plug feeding it); integrations able to mute the sensor itself (Matter soft
    // privacy mode, vendor "privacy mode" APIs) map their control onto this feature.
    ENABLED: 'enabled',
    // PTZ control (spec docs/specs/camera-ptz-control.md). MOVE: one command feature for all
    // movements, values from CAMERA_MOVE, per-camera subset declared via supported_options.
    // PRESET: recall a saved position; the labeled list lives in supported_options, the value
    // sent is the option's integer (the integration maps it to its protocol token).
    // *_POSITION: optional absolute position, numeric read/write, bounds declared by the
    // integration via min/max (units are integration-defined: normalized ONVIF space, degrees...).
    MOVE: 'move',
    PRESET: 'preset',
    PAN_POSITION: 'pan-position',
    TILT_POSITION: 'tilt-position',
    ZOOM_POSITION: 'zoom-position',
  },
  CHARGING_STATION: {
    CONNECTOR_STATUS: 'connector-status',
    CHARGING_STATE: 'charging-state',
  },
  DOORBELL: {
    RING: 'ring',
  },
  SIREN: {
    BINARY: 'binary',
    LMH_VOLUME: 'lmh_volume',
    MELODY: 'melody',
    TEST_IN_PROGRESS: 'test-in-progress', // Alarm testing status (binary - sensor)
    ALARM_MODE: 'alarm-mode', // Effect played when the siren is triggered (SIREN_MODE - command)
    ALARM_STATE: 'alarm-state', // Effect the siren is currently playing (SIREN_MODE - sensor)
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
    // Whether the device battery is currently being recharged (binary - sensor). Intrinsic to the
    // battery of the device itself: a charging station's session state belongs to
    // CHARGING_STATION.CHARGING_STATE, and the charge level stays on BATTERY.INTEGER.
    CHARGING: 'charging',
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
    FAN_SPEED: 'fan-speed',
    SWING_HORIZONTAL: 'swing-horizontal',
    SWING_VERTICAL: 'swing-vertical',
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
  // Exchange with the public grid (the connection point), whatever the
  // measuring device: a plug-in battery's grid port, an EM clamp or a
  // whole-home meter all publish here, so the same physical quantity never
  // splits across categories. (teleinformation stays as-is for Linky legacy.)
  // Import/export are split so core automations can tell direction apart;
  // `power` is the signed single value some devices report instead
  // (import > 0, export < 0). An integration maps whichever form its device
  // NATIVELY reports - never both for the same measurement.
  GRID_SENSOR: {
    INPUT_POWER: 'input-power', // instantaneous power imported from the grid, W (>= 0)
    OUTPUT_POWER: 'output-power', // instantaneous power exported to the grid, W (>= 0)
    POWER: 'power', // signed grid exchange when the device reports a single value (import > 0, export < 0), W
    INPUT_INDEX: 'input-index', // cumulative imported-energy meter index, kWh (>= 0)
    OUTPUT_INDEX: 'output-index', // cumulative exported-energy meter index, kWh (>= 0)
  },
  // The power the device ITSELF delivers to the installation it feeds (e.g. a
  // storage inverter's home output), plus its backup/off-grid output.
  // House consumption measured by an inverter (the "load power" many hybrid
  // inverters report, which can exceed the inverter's own output when the
  // grid tops up) is NOT this category - it goes to energy-sensor.
  HOME_OUTPUT_SENSOR: {
    POWER: 'power', // instantaneous power delivered to the home, W (>= 0)
    INDEX: 'index', // cumulative delivered-energy meter index, kWh (>= 0)
    OFF_GRID_POWER: 'off-grid-power', // instantaneous power on the backup/off-grid output, W (>= 0)
    OFF_GRID_INDEX: 'off-grid-index', // cumulative backup-output energy meter index, kWh (>= 0)
  },
  BATTERY_STORAGE: {
    BATTERY_LEVEL: 'battery-level', // state of charge, % (0..100)
    CHARGE_POWER: 'charge-power', // power INTO the battery, W/kW (>=0)
    DISCHARGE_POWER: 'discharge-power', // power OUT of the battery, W/kW (>=0)
    CHARGE_INDEX: 'charge-index', // cumulative charged-energy meter index, kWh
    DISCHARGE_INDEX: 'discharge-index', // cumulative discharged-energy meter index, kWh
    BATTERY_ENERGY_REMAINING: 'battery-energy-remaining', // currently available stored energy (instantaneous), kWh
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
    MODE: 'mode',
    OPERATING_STATE: 'operating-state',
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
    // A choice among string values the integration discovers on the appliance itself
    // (installed TV apps, HDMI sources, vacuum rooms, native scenes...): the choices are
    // declared per-device through supported_options ({ value, label }) and are NOT part of
    // the taxonomy. The state is the selected option's value, stored as a string
    // (last_value_string, no history). Enum-like capabilities standards cover (AC modes,
    // fan speeds...) keep their own category/type with integer values: this type is only
    // for lists no generic value set can describe.
    SELECT: 'select',
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
  // Domestic hot water appliances: electric storage tanks, heat-pump water heaters,
  // gas-fired water heaters. Scope is limited to producing and storing hot water.
  // Boundary with neighboring categories: the water temperature measured in the tank
  // is a temperature-sensor/decimal feature, electrical consumption is energy-sensor,
  // and room heating stays in heater/thermostat — a water heater device carries those
  // features alongside its water-heater ones.
  // Value conventions: all commands are non-negative integers; `mode` is an index into
  // WATER_HEATER_MODE, `binary`/`heating`/`boost` are 0/1. Boosting exists both as a
  // mode value and as the `boost` command: an integration maps whichever form its
  // appliance natively reports, never both for the same function.
  WATER_HEATER: {
    BINARY: 'binary', // appliance on/off (command)
    MODE: 'mode', // operating mode, WATER_HEATER_MODE (command)
    TARGET_TEMPERATURE: 'target-temperature', // hot water setpoint (command)
    REMAINING_HOT_WATER: 'remaining-hot-water', // hot water available, % or litres V40 (sensor)
    HEATING: 'heating', // actively heating water or not (sensor)
    BOOST: 'boost', // forced heating on/off (command)
  },
  WATER_VALVE: {
    // Types used by the SONOFF SWV in Zigbee2mqtt
    CURRENT_DEVICE_STATUS: 'current-device-status',
    FLOW: 'flow',
    AUTO_CLOSE_WHEN_WATER_SHORTAGE: 'auto-close-when-water-shortage',
    VALVE_WORK_STATE: 'valve-work-state',
    REAL_TIME_IRRIGATION_DURATION: 'real-time-irrigation-duration',
    REAL_TIME_IRRIGATION_VOLUME: 'real-time-irrigation-volume',
    DAILY_IRRIGATION_VOLUME: 'daily-irrigation-volume',
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
  MAINTENANCE: {
    LIFE_REMAINING: 'life-remaining', // Remaining life of a consumable/wear part in percent (integer - sensor)
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
  // Flow units
  CUBIC_METER_PER_HOUR: 'cubic-meter-per-hour',
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
