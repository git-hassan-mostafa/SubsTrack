import createCache, { type EmotionCache } from "@emotion/cache";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { prefixer } from "stylis";
import { isRtlLanguage } from "@shared/core/i18n";

const LTR_CACHE = createCache({ key: "mui" });
const RTL_CACHE = createCache({ key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] });

// the RTL cache mirrors every physical left/right style, so any sx `ml` flips
export function styleCacheFor(language: string): EmotionCache {
  return isRtlLanguage(language) ? RTL_CACHE : LTR_CACHE;
}
