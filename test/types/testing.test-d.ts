/**
 * Compile-time check of the testing typings (`npm run check-types`).
 */
import { DEVICE_POLL_FREQUENCIES, DeviceState, GladysIntegration } from '@gladysassistant/integration-sdk';
import {
  createFakeGladys,
  FakeGladysAck,
  FakeGladysIntegration,
  FakeGladysRequest,
} from '@gladysassistant/integration-sdk/testing';

// The code under test only knows the real client.
const registerHandlers = (gladys: GladysIntegration): void => {
  gladys.onPoll(async (device) => {
    await gladys.publishState(`${device.external_id}:temperature`, 21.5);
  });
};

const main = async (): Promise<void> => {
  const gladys: FakeGladysIntegration = createFakeGladys({
    selector: 'weather',
    config: { api_key: 'key' },
    devices: [
      {
        external_id: 'ext:weather:station:1',
        should_poll: true,
        poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
      },
    ],
    houses: [{ id: 'house-1', name: 'Home', selector: 'home', latitude: null, longitude: null }],
    scanResults: { mdns: [] },
  });
  registerHandlers(gladys);
  await gladys.connect();

  const ack: FakeGladysAck = await gladys.fake.poll({ external_id: 'ext:weather:station:1' });
  const success: boolean = ack.success;
  const error: string | undefined = ack.error;
  const last: number | string | undefined = gladys.fake.lastState('ext:weather:station:1:temperature');
  const states: DeviceState[] = gladys.fake.states;
  const requests: FakeGladysRequest[] = gladys.fake.requests;
  const status: number = requests[0].status;
  const widgetAck: FakeGladysAck = await gladys.fake.widgetGet('forecast', { language: 'fr', units: 'us' });
  const webhookAck: FakeGladysAck | undefined = await gladys.fake.webhook('events', { body: '{}' }, { mode: 'sync' });
  await gladys.fake.deviceCreated({ external_id: 'ext:weather:station:2' });
  await gladys.fake.configUpdated({ api_key: 'new' });
  await gladys.fake.scanRequest();
  gladys.fake.houses = [];
  const refreshes: string[] = gladys.fake.widgetRefreshes;
  await gladys.fake.shutdown('SIGINT');

  void [success, error, last, states, status, widgetAck, webhookAck, refreshes];
};

void main;
