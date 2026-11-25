// @ts-nocheck — Deno runtime file.
import { parsePhoneNumberFromString } from "https://esm.sh/libphonenumber-js@1/max";
import { internationalPhoneDigits, toLatinDigits } from "../digits.ts";

function validE164(candidate: string, region: string | null): string | null {
  const parsed = parsePhoneNumberFromString(candidate, region ?? undefined);
  return parsed && parsed.isValid() ? parsed.number : null;
}

// A local number tries the sending number's region first, then Lebanon (_shared/digits.ts).
export function toE164(raw: string | null | undefined, defaultRegion: string | null): string | null {
  const trimmed = toLatinDigits(raw ?? "").trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const inRegion = validE164(candidate, defaultRegion);
  if (inRegion) return inRegion;
  const international = internationalPhoneDigits(trimmed);
  return international ? validE164(`+${international}`, null) : null;
}

export function regionOf(displayPhoneNumber: string | null | undefined): string | null {
  const trimmed = (displayPhoneNumber ?? "").trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
  return parsed?.country ?? null;
}

// A wa_id is not always E.164 (Mexico's keeps a 1), so it goes through toE164.
export function fromWaId(waId: string | null | undefined): string | null {
  const digits = (waId ?? "").replace(/\D/g, "");
  return digits ? (toE164(`+${digits}`, null) ?? `+${digits}`) : null;
}
