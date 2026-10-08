// Windows has a 260-character path limit and React Native's codegen C++ objects nest the
// full source path inside the build folder (300+ characters). Capping CMake's object path
// length makes CMake replace long object names with a short hash, so release builds work
// on Windows without enabling long paths system-wide. Harmless on macOS / Linux.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// servon-short-cmake-object-paths';

module.exports = function withShortCmakeObjectPaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARK)) return cfg;
    gradle = gradle.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {
        ${MARK}
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=250"
            }
        }`,
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
