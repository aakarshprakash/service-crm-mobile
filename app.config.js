// Extends app.json with build-time settings that depend on files present on this machine.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // Push notifications on Android need the Firebase project's google-services.json
  // (Firebase console → Project settings → Android app com.servon.technician).
  // Builds without it still work; the app reports push as unavailable.
  const googleServices = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, 'google-services.json');
  if (fs.existsSync(googleServices)) {
    config.android = { ...config.android, googleServicesFile: googleServices };
  }
  // Plain HTTP is only for a local dev server; release builds talk to the HTTPS API and refuse cleartext.
  const cleartext = (process.env.EXPO_PUBLIC_API_URL ?? '').startsWith('http://');
  config.plugins = config.plugins.map((p) =>
    Array.isArray(p) && p[0] === 'expo-build-properties' ? [p[0], { ...p[1], android: { ...p[1].android, usesCleartextTraffic: cleartext } }] : p,
  );
  // Cached jobs and customer details must not be copied to cloud backups.
  config.android = { ...config.android, allowBackup: false };
  return config;
};
