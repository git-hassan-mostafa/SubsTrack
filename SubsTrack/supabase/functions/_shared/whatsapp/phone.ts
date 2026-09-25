// @ts-nocheck — Deno runtime file.
import { parsePhoneNumberFromString } from "https://esm.sh/libphonenumber-js@1/max";

// A local number ("03 123456") takes the tenant WhatsApp number's region.
export function toE164(raw: string | null | undefined, defaultRegion: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, defaultRegion ?? undefined);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
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
