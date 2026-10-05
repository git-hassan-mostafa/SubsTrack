import type { Collection, Currency, OpenItem } from "@shared/core/types";
import { groupKey, groupOwedByCurrency, planCollection, type CurrencyPlan } from "./currencyGroups";
import { isDebtItem } from "./debtRule";
import { amountByCharge } from "./paidToCharge";
import { roundMoney } from "./waterfall";

export type CorrectionProblem = "zero" | "unchanged" | "too_much";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const NO_SKIPS: ReadonlySet<string> = new Set();
const SAME_AMOUNT = 1e-6;

// The bills a hand-over paid, owing what they would owe had it never happened.
export function withoutCollection(
  bills: OpenItem[],
  collection: Pick<Collection, "items">,
): OpenItem[] {
  const own = amountByCharge(collection.items ?? []);
  return bills.map((bill) => {
    const paid = roundMoney(
      bill.paid - (bill.chargeId ? (own.get(bill.chargeId) ?? 0) : 0),
    );
    return {
      ...bill,
      paid,
      balance: roundMoney(bill.amount - paid),
      isDebt: isDebtItem(bill.kind, paid),
    };
  });
}

// A voided or written-off bill is closed — reopen it before correcting.
export function hasClosedBill(bills: OpenItem[]): boolean {
  return bills.some(
    (bill) => !!bill.charge?.voidedAt || !!bill.charge?.writtenOffAt,
  );
}

// A corrected amount re-spread over the SAME bills, in the hand-over's currency.
export function correctionPlan(
  pool: OpenItem[],
  amount: number | null,
  currencies: Currency[],
): CurrencyPlan | null {
  const group = groupOwedByCurrency(pool, currencies)[0];
  if (!group) return null;
  return planCollection([group], new Map([[groupKey(group), amount]]), NO_SKIPS)[0] ?? null;
}

// Why a typed correction cannot be saved yet — the service refuses the same.
export function correctionProblem(
  recorded: number,
  plan: Pick<CurrencyPlan, "amount" | "lines" | "leftover">,
): CorrectionProblem | null {
  const typed = plan.amount ?? 0;
  if (typed <= 0) return "zero";
  if (Math.abs(typed - recorded) <= SAME_AMOUNT) return "unchanged";
  if (plan.leftover > 0 || plan.lines.length === 0) return "too_much";
  return null;
}

const CORRECTION_PROBLEM_KEYS: Record<CorrectionProblem, string> = {
  zero: "ledger.correct_zero_hint",
  unchanged: "ledger.correct_unchanged_hint",
  too_much: "ledger.collect_blocker.lower_amount",
};

export function correctionProblemKey(problem: CorrectionProblem): string {
  return CORRECTION_PROBLEM_KEYS[problem];
}

// The void reason the replaced hand-over keeps, so the trail says what changed.
export function correctionReason(from: string, to: string, note: string, t: Translate): string {
  return [t("ledger.corrected_reason", { from, to }), note.trim()].filter(Boolean).join(" · ");
}
