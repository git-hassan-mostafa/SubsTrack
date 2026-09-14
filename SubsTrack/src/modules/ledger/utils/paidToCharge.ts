import type { Collection } from "@/src/core/types";

// What ONE hand-over put against ONE bill — it may have covered others too.
export function paidToCharge(
  collection: Collection,
  chargeId: string | null,
): number {
  return (collection.items ?? [])
    .filter((i) => i.chargeId === chargeId)
    .reduce((sum, i) => sum + i.amount, 0);
}
