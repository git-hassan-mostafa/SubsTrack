const EPSILON = 1e-9;

export type PaymentMode = "full" | "partial" | "debt";

export type PartialOutcome =
  | { kind: "exceeds" }
  | { kind: "cleared" }
  | { kind: "owes"; balance: number };

// Full hands over all of `due`, pay later nothing; a partial is capped at `due`.
export function collectedFor(
  mode: PaymentMode,
  typed: number | null,
  due: number,
): number {
  if (mode === "debt") return 0;
  if (mode === "partial") return Math.min(typed ?? 0, due);
  return due;
}

export interface PaymentModeOption {
  mode: PaymentMode;
  labelKey: string;
  disabled: boolean;
}

export interface AmountCollectedView {
  options: PaymentModeOption[];
  partialLocked: boolean;
  outcome: PartialOutcome | null;
}

const PAYMENT_MODES: PaymentMode[] = ["full", "partial", "debt"];

const MODE_LABEL_KEYS: Record<PaymentMode, string> = {
  full: "payments.full_payment",
  partial: "payments.partial_payment",
  debt: "payments.no_payment",
};

// A partial needs a positive total to be a part of; only partial reads an outcome.
export function amountCollectedView(
  mode: PaymentMode,
  due: number,
  typed: number | null,
): AmountCollectedView {
  const partialLocked = !(due > 0);
  return {
    options: PAYMENT_MODES.map((option) => ({
      mode: option,
      labelKey: MODE_LABEL_KEYS[option],
      disabled: option === "partial" && partialLocked,
    })),
    partialLocked,
    outcome:
      mode === "partial" && !partialLocked ? partialOutcome(due, typed) : null,
  };
}

// What a typed partial amount leaves on the bill; null until both are known.
export function partialOutcome(
  due: number | null,
  typed: number | null,
): PartialOutcome | null {
  if (due == null || typed == null) return null;
  const balance = due - typed;
  if (balance < -EPSILON) return { kind: "exceeds" };
  if (balance <= EPSILON) return { kind: "cleared" };
  return { kind: "owes", balance };
}
