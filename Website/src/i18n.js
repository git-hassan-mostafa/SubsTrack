import arabicText from "./i18n/ar.js";
import scriptText from "./i18n/scriptText.js";
import { saveSetting } from "./storage.js";

const LANGUAGE_KEY = "sijil_lang";
const englishHtml = new Map();
const englishAttributes = new Map();
const listeners = [];

// The inline script in index.html picks the first language; this only reads it.
export function currentLanguage() {
  return document.documentElement.lang === "ar" ? "ar" : "en";
}

export function currentScriptText() {
  return scriptText[currentLanguage()];
}

export function onLanguageChange(listener) {
  listeners.push(listener);
}

function translatedOr(key, english, lang) {
  const arabic = arabicText[key];
  return lang === "ar" && arabic !== undefined ? arabic : english;
}

function attributePairs(element) {
  return element.dataset.i18nAttr.split(";").map((pair) => pair.split(":"));
}

function translateHtml(lang) {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (!englishHtml.has(element)) englishHtml.set(element, element.innerHTML);
    element.innerHTML = translatedOr(element.dataset.i18n, englishHtml.get(element), lang);
  });
}

function translateAttributes(lang) {
  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    const pairs = attributePairs(element);
    if (!englishAttributes.has(element)) {
      englishAttributes.set(element, Object.fromEntries(pairs.map(([name]) => [name, element.getAttribute(name)])));
    }
    const english = englishAttributes.get(element);
    pairs.forEach(([name, key]) => element.setAttribute(name, translatedOr(key, english[name], lang)));
  });
}

function rememberLanguage(lang) {
  const url = new URL(window.location.href);
  if (lang === "ar") url.searchParams.set("lang", "ar");
  else url.searchParams.delete("lang");
  window.history.replaceState(null, "", url);
  saveSetting(LANGUAGE_KEY, lang);
}

function applyLanguage(lang) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === "ar" ? "rtl" : "ltr";
  translateHtml(lang);
  translateAttributes(lang);
  document.getElementById("lang-toggle-btn")?.setAttribute("lang", lang === "ar" ? "en" : "ar");
  root.classList.remove("i18n-pending");
  listeners.forEach((listener) => listener(lang));
}

export function initLanguage() {
  applyLanguage(currentLanguage());
  document.getElementById("lang-toggle-btn")?.addEventListener("click", () => {
    const next = currentLanguage() === "ar" ? "en" : "ar";
    rememberLanguage(next);
    applyLanguage(next);
  });
}
