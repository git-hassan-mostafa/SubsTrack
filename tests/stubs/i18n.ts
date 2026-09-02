// The app's i18n instance, minus i18next. Returns the KEY, with interpolation
// values appended, so a test can assert which rule fired without depending on
// wording in en.json.
const i18n = {
  language: 'en',
  t(key: string, opts?: Record<string, unknown>): string {
    if (!opts) return key;
    const parts = Object.entries(opts)
      .filter(([k]) => k !== 'count' || true)
      .map(([k, v]) => `${k}=${String(v)}`);
    return parts.length > 0 ? `${key} ${parts.join(' ')}` : key;
  },
};

export default i18n;
export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export const FALLBACK_LANGUAGE = 'en' as const;
