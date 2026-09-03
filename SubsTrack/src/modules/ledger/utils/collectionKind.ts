import type { ChargeKind, WalletSource } from '@/src/core/types';

/**
 * What a hand-over PAID FOR: the one kind every line shares, or 'mixed'.
 *
 * 'mixed' is honest rather than tidy — one hand-over can settle a month AND a
 * sale, and no allocation could split the physical cash between them.
 *
 * Written to `collections.kind` when the money is taken (the items never change
 * afterwards) and re-derived on read for rows older than that column, so the
 * type filter and the card badge always agree.
 */
export function collectionKind(kinds: (ChargeKind | undefined | null)[]): WalletSource {
  const present = kinds.filter((k): k is ChargeKind => !!k);
  if (present.length === 0) return 'mixed';
  return present.every((k) => k === present[0]) ? present[0] : 'mixed';
}
