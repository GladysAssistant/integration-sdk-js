/**
 * Compile-time check of the public typings (`npm run check-types`).
 * Mirrors the example of contract C.8.
 */
import {
  ActionFields,
  createLogger,
  Device,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
  DeviceExternalIds,
  DeviceFeature,
  DeviceTransport,
  DeviceTransportEntry,
  GladysApiError,
  GladysIntegration,
  HardwareUpdatedContainer,
  IntegrationConfig,
  IntegrationContainer,
  LinkedContact,
  LinkedUser,
  logger,
  Logger,
  MdnsScanResult,
  OutgoingMessage,
  UdpBroadcastScanResult,
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

  gladys.onGetImage(async (device: Device) => `image/jpg;base64,${device.external_id}`);

  gladys.onConfigUpdated(async (config: IntegrationConfig) => {
    await gladys.setConfig({ last_seen_config: JSON.stringify(config) });
  });

  gladys.onHardwareUpdated(async (containers: HardwareUpdatedContainer[]) => {
    const granted: boolean = containers[0].devices[0].granted;
    void granted;
  });

  gladys.onOAuthAuthorizeUrl(
    async (key: string, redirectUri: string) =>
      `https://provider.example/authorize?key=${key}&redirect_uri=${redirectUri}`,
  );

  gladys.onOAuthCallback(async (key: string, params: { code: string; state: string; redirectUri: string }) => {
    await gladys.setConfig({ [`${key}_code`]: params.code });
    await gladys.setConnectionStatus(true);
  });

  gladys.onAction('detect_protocol', async (fields: ActionFields) => `Detected on ${String(fields.ip)}`);
  gladys.onAction('test_connection', async () => ({ en: 'Connected!', fr: 'Connecté !' }));

  gladys.onSendMessage(async (contactId: string, message: OutgoingMessage) => {
    const line: string = `${contactId}: ${message.text} ${message.file ?? ''}`;
    void line;
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

  await gladys.publishCameraImage(gladys.externalId('cam:abc'), 'image/jpg;base64,/9j/4AAQ');
  const transport: DeviceTransport = DEVICE_TRANSPORTS.LOCAL;
  const entries: DeviceTransportEntry[] = [{ external_id: gladys.externalId('plug:abc'), transport }];
  await gladys.publishTransports(entries);
  const preferLocal: unknown = gladys.config.GLADYS_PREFER_LOCAL;
  void preferLocal;

  await gladys.setConnectionStatus(false, { en: 'Token expired, please reconnect.', fr: 'Token expiré.' });
  const containers: IntegrationContainer[] = await gladys.getContainers();
  const hostPort: number | undefined = containers[0]?.ports[0]?.host_port;
  await gladys.startContainer('mqtt', { env: { MQTT_PASSWORD: 's3cr3t' } });
  await gladys.startContainer('mqtt');
  await gladys.stopContainer('mqtt');
  await gladys.restartContainer('frigate');
  const oauthType: string = WEBSOCKET_MESSAGE_TYPES.EXTERNAL_INTEGRATION.OAUTH_GET_AUTHORIZE_URL;
  void [hostPort, oauthType];

  await gladys.publishMessage('12345', 'Turn on the light');
  await gladys.publishMessage('12345', 'Received offline', { createdAt: new Date() });
  const linkedUser: LinkedUser = await gladys.linkContact('AB23CD45', '12345', 'John');
  const contacts: LinkedContact[] = await gladys.getContacts();
  const messageType: string = WEBSOCKET_MESSAGE_TYPES.EXTERNAL_INTEGRATION.MESSAGE_SEND;
  void [linkedUser.first_name, contacts[0]?.contact_id, messageType];

  const announcements: UdpBroadcastScanResult[] = await gladys.scanNetwork('udp-broadcast', { timeoutSeconds: 10 });
  const payload: string = announcements[0].payload_base64;
  const services: MdnsScanResult[] = await gladys.scanNetwork('mdns');
  const txt: Record<string, string> = services[0].txt;
  const headers = await gladys.scanNetwork('ssdp', { timeoutSeconds: 5 });
  void [payload, txt, headers];

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
