const { withInfoPlist } = require('expo/config-plugins');

/**
 * Capacités qui rendent une app iOS indisponible sur Mac (Designed for iPad).
 * armv7 est le défaut du modèle Expo : un Mac Apple Silicon ne le déclare pas.
 */
const MAC_BLOCKED_CAPABILITIES = [
  'armv7',
  'telephony',
  'sms',
  'gps',
  'location-services',
  'magnetometer',
  'nfc',
  'wifi',
  'bluetooth-le',
  'healthkit',
  'gamekit',
  'camera-flash',
  'front-facing-camera',
  'video-camera',
  'still-camera',
  'microphone',
  'accelerometer',
  'gyroscope',
];

const IPAD_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

function macCompatiblePlist(info) {
  const next = { ...info };
  next.UIApplicationSupportsIndirectInputEvents = true;
  next['UISupportedInterfaceOrientations~ipad'] = IPAD_ORIENTATIONS;
  const caps = Array.isArray(next.UIRequiredDeviceCapabilities) ? next.UIRequiredDeviceCapabilities : [];
  const kept = caps.filter((cap) => typeof cap === 'string' && !MAC_BLOCKED_CAPABILITIES.includes(cap));
  if (kept.length) next.UIRequiredDeviceCapabilities = kept;
  else delete next.UIRequiredDeviceCapabilities;
  if (next.UIRequiresFullScreen === true) next.UIRequiresFullScreen = false;
  return next;
}

/** iPad + fenêtre redimensionnable. Ne retire pas la disponibilité Mac. */
function withMacIpad(config) {
  config.ios = { ...(config.ios || {}), supportsTablet: true, requireFullScreen: false };
  return withInfoPlist(config, (cfg) => {
    cfg.modResults = macCompatiblePlist(cfg.modResults);
    return cfg;
  });
}

module.exports = withMacIpad;
module.exports.macCompatiblePlist = macCompatiblePlist;
module.exports.MAC_BLOCKED_CAPABILITIES = MAC_BLOCKED_CAPABILITIES;
module.exports.IPAD_ORIENTATIONS = IPAD_ORIENTATIONS;
