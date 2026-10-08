// Signs `assembleRelease` with the Servon upload keystore instead of the debug key.
// Reads SERVON_KEYSTORE / SERVON_KEYSTORE_PASSWORD / SERVON_KEY_ALIAS / SERVON_KEY_PASSWORD
// from the environment or ~/.gradle/gradle.properties at build time, so no secret is
// ever written into the repository. Without them the build falls back to debug signing.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// servon-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARK)) return cfg;

    const prop = (name) => `(System.getenv("${name}") ?: (project.findProperty("${name}") ?: ""))`;
    gradle = gradle.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${MARK}
        release {
            def ks = ${prop('SERVON_KEYSTORE')}
            if (ks) {
                storeFile file(ks)
                storePassword ${prop('SERVON_KEYSTORE_PASSWORD')}
                keyAlias ${prop('SERVON_KEY_ALIAS')}
                keyPassword ${prop('SERVON_KEY_PASSWORD')}
            }
        }`,
    );
    // Use the release config for release builds when a keystore is configured.
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig(${prop('SERVON_KEYSTORE')} ? signingConfigs.release : signingConfigs.debug)`,
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
