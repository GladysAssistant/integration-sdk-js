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
   * Exception: a token refused by Gladys (close code 4000) stops reconnection
   * for good — a refused token is revoked and never becomes valid again.
   */
  connect(): Promise<void>;

  /** Close the connection cleanly and stop reconnecting. */
  disconnect(): Promise<void>;

  /** Build a namespaced external id: `ext:<selector>:<suffix>`. */
  externalId(suffix: string): string;

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
