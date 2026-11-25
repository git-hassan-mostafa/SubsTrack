const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const DEFAULT_COUNTRY_CODE = "961";

// Arabic-Indic and Persian digits as 0-9; Arabic decimal/thousands marks as "." and ",".
export function toLatinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

// No country code means Lebanon (target market): "03 123 456" → "9613123456".
export function internationalPhoneDigits(raw: string | null | undefined): string | null {
  const text = toLatinDigits(raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  if (text.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2) || null;
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return digits;
  const local = digits.replace(/^0+/, "");
  return local ? DEFAULT_COUNTRY_CODE + local : null;
}
