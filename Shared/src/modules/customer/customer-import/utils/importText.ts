import { toLatinDigits } from "@shared/core/utils/digits";

const YES = new Set(["yes", "y", "true", "1", "نعم", "اي", "ايوه", "ايه", "اجل"]);
const NO = new Set(["no", "n", "false", "0", "لا", "كلا"]);

// Case, spacing, Arabic letter forms and diacritics never make two names differ.
export function matchKey(text: string): string {
  return toLatinDigits(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

// "+961 3 123 456", "00961-3123456" and "03 123 456" are the same Lebanese line.
export function phoneKey(phone: string): string | null {
  const digits = toLatinDigits(phone).replace(/\D/g, "");
  const local = digits.replace(/^00/, "").replace(/^961/, "").replace(/^0+/, "");
  return local === "" ? null : local;
}

export function parseYesNo(text: string): boolean | null {
  const key = matchKey(text);
  if (YES.has(key)) return true;
  if (NO.has(key)) return false;
  return null;
}

// Thousands commas are dropped: one cell holds one number, never a list.
export function parseNumber(text: string): number | null {
  const plain = toLatinDigits(text).replace(/[\s,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return null;
  return Number(plain);
}

function dayString(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Lebanon writes day first; a year-first date is ISO. Anything else is refused.
export function parseDay(text: string): string | null {
  const plain = toLatinDigits(text).trim();
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(plain);
  if (isoMatch) return dayString(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(plain);
  if (dayFirst) return dayString(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  return null;
}

// A link with a scheme, geo:, or a bare "maps.app.goo.gl/…" that locationHref completes.
export function isMapLink(text: string): boolean {
  const raw = text.trim();
  return /^[a-z]+:\/\/\S+$/i.test(raw) || raw.startsWith("geo:") || /^[\w-]+(\.[\w-]+)+\/\S*$/i.test(raw);
}
