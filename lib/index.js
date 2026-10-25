const { GladysIntegration } = require('./gladys-integration');
const { GladysApiError } = require('./errors');
const {
  WEBSOCKET_MESSAGE_TYPES,
  DEVICE_TRANSPORTS,
  WEATHER_CONDITIONS,
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_TYPES,
  AI_CHAT_PURPOSES,
  TTS_AUDIO_CONTENT_TYPES,
  MUSIC_PLAYBACK_STATE,
  MUSIC_REPEAT_MODE,
  MUSIC_MEDIA_TYPES,
  MUSIC_PLAY_MODES,
} = require('./constants');
const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} = require('./device-constants');
const {
  WIDGET_COLORS,
  WIDGET_TEXT_VARIANTS,
  WIDGET_CHART_TYPES,
  WIDGET_CHART_INTERVALS,
  WIDGET_CARD_LIST_DISPLAYS,
  WIDGET_IMAGE_FITS,
  WIDGET_BUTTON_STYLES,
  validateWidgetContent,
  validateWidgetImage,
} = require('./widget-content');
const { createLogger, logger } = require('./logger');
const { parseMdnsTxt } = require('./mdns');
const { artworkKey, validateMediaItems } = require('./music');
const { validateAiCompletion } = require('./providers');

module.exports = {
  GladysIntegration,
  GladysApiError,
  WEBSOCKET_MESSAGE_TYPES,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  DEVICE_TRANSPORTS,
  WEATHER_CONDITIONS,
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_TYPES,
  AI_CHAT_PURPOSES,
  TTS_AUDIO_CONTENT_TYPES,
  MUSIC_PLAYBACK_STATE,
  MUSIC_REPEAT_MODE,
  MUSIC_MEDIA_TYPES,
  MUSIC_PLAY_MODES,
  WIDGET_COLORS,
  WIDGET_TEXT_VARIANTS,
  WIDGET_CHART_TYPES,
  WIDGET_CHART_INTERVALS,
  WIDGET_CARD_LIST_DISPLAYS,
  WIDGET_IMAGE_FITS,
  WIDGET_BUTTON_STYLES,
  validateWidgetContent,
  validateWidgetImage,
  artworkKey,
  validateMediaItems,
  validateAiCompletion,
  createLogger,
  logger,
  parseMdnsTxt,
};
