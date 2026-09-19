import i18n from "@/src/core/i18n";
import type { QuotaKind } from "./types";

const MESSAGE_KEYS: Record<QuotaKind, string> = {
  customers: "errors.customer_limit_reached",
  plans: "errors.plan_limit_reached",
};

// The write would put the tenant over one of its two allowances.
export class QuotaExceededError extends Error {
  readonly kind: QuotaKind;
  readonly limit: number;
  readonly activeCount: number;

  constructor(kind: QuotaKind, limit: number, activeCount: number) {
    super(i18n.t(MESSAGE_KEYS[kind], { allowance: limit, count: activeCount }));
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.limit = limit;
    this.activeCount = activeCount;
  }
}
