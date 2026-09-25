import type { Collection, CollectionItem } from "@/src/core/types";

// What ONE hand-over put against ONE bill — it may have covered others too.
export function paidToCharge(
  collection: Collection,
  chargeId: string | null,
): number {
  return (collection.items ?? [])
    .filter((i) => i.chargeId === chargeId)
    .reduce((sum, i) => sum + i.amount, 0);
}

// What one hand-over put against EACH bill it touched.
export function amountByCharge(
  items: Pick<CollectionItem, "chargeId" | "amount">[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    out.set(item.chargeId, (out.get(item.chargeId) ?? 0) + item.amount);
  }
  return out;
}
