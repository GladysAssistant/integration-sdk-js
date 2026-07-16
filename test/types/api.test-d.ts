/**
 * Compile-time check of the public typings (`npm run check-types`).
 * Mirrors the example of contract C.8.
 */
import {
  createLogger,
  Device,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DeviceExternalIds,
  DeviceFeature,
  GladysApiError,
  GladysIntegration,
  IntegrationConfig,
  logger,
  Logger,
  WEBSOCKET_MESSAGE_TYPES,
} from '@gladysassistant/integration-sdk';

const main = async (): Promise<void> => {
  const gladys = new GladysIntegration({
    hostApiUrl: 'http://172.30.0.1:80',
    token: 'jwt',
    selector: 'ext-demo',
  });

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

  gladys.onSetValue(async (device: Device, feature: DeviceFeature, value: number) => {
    await gladys.publishState(feature.external_id, value);
  });

  gladys.onPoll(async (device: Device) => {
    await gladys.publishState(`${device.external_id}:temperature`, { state: 21.5, created_at: new Date() });
  });

  gladys.onConfigUpdated(async (config: IntegrationConfig) => {
    await gladys.setConfig({ last_seen_config: JSON.stringify(config) });
  });

  gladys.on('connected', () => {});
  gladys.on('disconnected', () => {});

  await gladys.connect();

  const devices: Device[] = await gladys.getDevices();
  const config: IntegrationConfig = await gladys.getConfig();
  const status = await gladys.getStatus();
  const version: string = status.gladys_version;

  await gladys.publishState(gladys.externalId('sensor:text'), { text: 'hello' });
  await gladys.publishStates([{ device_feature_external_id: gladys.externalId('sensor:temperature'), state: 20 }]);

  const error = new GladysApiError(401, 'UNAUTHORIZED', 'Invalid token');
  const parts: [number, string, string] = [error.status, error.code, error.message];

  const authType: string = WEBSOCKET_MESSAGE_TYPES.AUTHENTICATE.INTEGRATION_REQUEST;

  logger.info('connected', status.gladys_version);
  const namedLogger: Logger = createLogger({ name: 'weather-station', level: 'debug' });
  namedLogger.child('poll').debug('polling');

  const ids: DeviceExternalIds = gladys.externalIds('plug', '0x00158d0001a2b3c4');
  const featureId: string = ids.feature('power');

  const category: 'temperature-sensor' = DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR;
  const featureType: 'binary' = DEVICE_FEATURE_TYPES.SWITCH.BINARY;
  const unit: 'celsius' = DEVICE_FEATURE_UNITS.CELSIUS;

  gladys.handleShutdown(async (signal: 'SIGTERM' | 'SIGINT') => {
    logger.info('stopping on', signal);
  });
  void [ids.device, featureId, category, featureType, unit];

  await gladys.disconnect();

  // Reference otherwise-unused values so noUnusedLocals-style checks stay quiet.
  void [devices, config, version, parts, authType];
};

void main;
