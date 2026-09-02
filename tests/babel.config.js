// Pure-JS transform (no esbuild / swc binary) — this machine's AV blocks
// spawning native tool binaries, so babel is the only pipeline that runs here.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
  ],
};
