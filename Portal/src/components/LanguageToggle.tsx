import { useTranslation } from "react-i18next";
import { isRtl, SUPPORTED_LANGUAGES } from "../../stubs/i18n";

// Sets `dir` on <html> as well as the language: SubsTrack restarts the app to
// flip RTL, but a web page only needs the attribute.
export function LanguageToggle() {
  const { i18n } = useTranslation();

  function switchTo(next: string) {
    void i18n.changeLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = isRtl(next) ? "rtl" : "ltr";
  }

  return (
    <div className="flex gap-1">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => switchTo(lang)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase ${
            i18n.language === lang
              ? "bg-primary text-white"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
