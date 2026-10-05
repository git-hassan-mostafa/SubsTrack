import type { CollectionListItem } from "@shared/core/types";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const NAMED = 2;

/**
 * What a hand-over paid, in words: "Jan 2026 · Internet, Sale #12 +1".
 *
 * The card used to print "3 items" — a bare count, which is exactly the case
 * the reader needed spelled out. The labels themselves were already frozen by
 * the list read, so naming them costs nothing.
 */
export function collectionLabel(
  item: Pick<CollectionListItem, "itemLabels">,
  t: TFn,
): string {
  const labels = item.itemLabels.filter((l) => l.length > 0);
  if (labels.length === 0) return t("ledger.payment");
  const named = labels.slice(0, NAMED).join(", ");
  const rest = labels.length - NAMED;
  return rest > 0
    ? `${named} ${t("ledger.plus_more", { count: rest })}`
    : named;
}

// A paid-for line whose label never loaded still reads as a payment.
export function collectionItemLabel(
  item: Pick<CollectionListItem, "itemLabels">,
  index: number,
  t: TFn,
): string {
  return item.itemLabels[index] || t("ledger.payment");
}
