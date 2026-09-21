const { GladysIntegration } = require('./gladys-integration');
const { GladysApiError } = require('./errors');
const {
  WEBSOCKET_MESSAGE_TYPES,
  DEVICE_TRANSPORTS,
  WEATHER_CONDITIONS,
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_TYPES,
} = require('./constants');
const { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES, DEVICE_FEATURE_UNITS } = require('./device-constants');
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

module.exports = {
  GladysIntegration,
  GladysApiError,
  WEBSOCKET_MESSAGE_TYPES,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
  WEATHER_CONDITIONS,
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_TYPES,
  WIDGET_COLORS,
  WIDGET_TEXT_VARIANTS,
  WIDGET_CHART_TYPES,
  WIDGET_CHART_INTERVALS,
  WIDGET_CARD_LIST_DISPLAYS,
  WIDGET_IMAGE_FITS,
  WIDGET_BUTTON_STYLES,
  validateWidgetContent,
  validateWidgetImage,
  createLogger,
  logger,
};
