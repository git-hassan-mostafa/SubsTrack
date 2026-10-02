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
