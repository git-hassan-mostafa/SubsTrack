import type { Collection } from "@shared/core/types";

// A void returns lean rows (#119a); the caller's rows still know which bills they paid.
export function withCallerItems(
  voided: readonly Collection[],
  callers: readonly Pick<Collection, "id" | "items">[],
): Collection[] {
  const itemsById = new Map(callers.map((c) => [c.id, c.items]));
  return voided.map((row) => ({ ...row, items: row.items ?? itemsById.get(row.id) }));
}
