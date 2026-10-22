import type { TFunction } from "i18next";
import type { PrepaidExpiry } from "@shared/core/types";
import { formatDate } from "@shared/core/utils/date";

export type PrepaidTextKey =
  | "paid_until"
  | "no_payment_yet"
  | "expires_today"
  | "expires_in"
  | "expired_today"
  | "expired_ago";

export interface PrepaidText {
  key: PrepaidTextKey;
  values?: { date?: string; count?: number };
}

// "Paid until" first, then how soon it ends; a pill shows only the last part.
export function prepaidTextParts(expiry: PrepaidExpiry | null): PrepaidText[] {
  if (!expiry?.paidUntil) return [{ key: "no_payment_yet" }];
  const until: PrepaidText = {
    key: "paid_until",
    values: { date: formatDate(expiry.paidUntil) },
  };
  return expiry.state === "paid_until" ? [until] : [until, endText(expiry)];
}

function endText({ state, days }: PrepaidExpiry): PrepaidText {
  if (state === "expiring") {
    return days === 0
      ? { key: "expires_today" }
      : { key: "expires_in", values: { count: days } };
  }
  return days === 0
    ? { key: "expired_today" }
    : { key: "expired_ago", values: { count: days } };
}

// The portal keeps its own copy of these keys under "portal".
export function prepaidLabel(
  t: TFunction,
  parts: readonly PrepaidText[],
  keyPrefix: "payments" | "portal" = "payments",
): string {
  return parts.map((part) => t(`${keyPrefix}.${part.key}`, part.values)).join(" · ");
}

export function prepaidPillLabel(t: TFunction, expiry: PrepaidExpiry): string {
  return prepaidLabel(t, prepaidTextParts(expiry).slice(-1));
}
