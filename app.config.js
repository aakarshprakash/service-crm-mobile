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
  return config;
};
