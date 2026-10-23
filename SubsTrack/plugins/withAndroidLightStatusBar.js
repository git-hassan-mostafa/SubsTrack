const { addImports } = require("@expo/config-plugins/build/android/codeMod");
const {
  mergeContents,
} = require("@expo/config-plugins/build/utils/generateCode");
const { withMainActivity } = require("expo/config-plugins");

// Android 12 splash exit restores the bar look saved at launch — see gotcha #195
function withAndroidLightStatusBar(config) {
  return withMainActivity(config, (config) => {
    const { modResults } = config;
    const withImports = addImports(
      modResults.contents,
      ["androidx.core.view.WindowCompat"],
      false,
    );
    const merged = mergeContents({
      src: withImports,
      comment: "    //",
      tag: "android-light-status-bar",
      offset: 1,
      anchor: /super\.onCreate\(null\)/,
      newSrc:
        "    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true",
    });
    return {
      ...config,
      modResults: { ...modResults, contents: merged.contents },
    };
  });
}

module.exports = withAndroidLightStatusBar;
