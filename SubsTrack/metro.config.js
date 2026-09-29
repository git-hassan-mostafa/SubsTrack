const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const sharedRoot = path.resolve(__dirname, "../Shared");

// Flagless on purpose: Metro refuses to merge blockList patterns whose flags differ.
function folderPattern(dir) {
  const parts = dir
    .split(/[\\/]/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .map((p) => p.replace(/^([A-Za-z]):$/, (_, d) => `[${d.toUpperCase()}${d.toLowerCase()}]:`));
  return new RegExp(`^${parts.join("[\\\\/]")}[\\\\/].*`);
}

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = false;
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  folderPattern(path.join(sharedRoot, "node_modules")),
];

module.exports = withNativeWind(config, { input: "./global.css" });
