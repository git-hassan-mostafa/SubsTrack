import type { Collection } from "@/src/core/types";

// The columns a custody move writes on `collections` — the one table that
// carries custody — identical on both platforms. Kept in one place so the two
// exits from the chain can never drift: handing cash to the next holder clears any old
// settlement, and settling it (toUserId null) empties the wallet and records
// who took it out. chk_*_custody enforces the pairing server-side.
export interface CustodyValues {
  held_by_user_id: string | null;
  remitted_at: string | null;
  remitted_by: string | null;
}

export function custodyValues(
  toUserId: string | null,
  actorUserId: string,
  now: string = new Date().toISOString(),
): CustodyValues {
  return toUserId
    ? { held_by_user_id: toUserId, remitted_at: null, remitted_by: null }
    : { held_by_user_id: null, remitted_at: now, remitted_by: actorUserId };
}

// Fresh cash starts in the wallet of whoever took it.
export function receivedCustody(
  receivedByUserId: string | null,
): CustodyValues {
  return {
    held_by_user_id: receivedByUserId,
    remitted_at: null,
    remitted_by: null,
  };
}

// Where a hand-over's cash is now — what a replacement of it must inherit.
export function custodyOf(
  collection: Pick<Collection, "heldByUserId" | "remittedAt" | "remittedBy">,
): CustodyValues {
  return {
    held_by_user_id: collection.heldByUserId,
    remitted_at: collection.remittedAt,
    remitted_by: collection.remittedBy,
  };
}

// The one custody all these hand-overs share, or null if they differ.
export function sharedCustody(
  collections: Pick<Collection, "heldByUserId" | "remittedAt" | "remittedBy">[],
): CustodyValues | null {
  if (collections.length === 0) return null;
  const first = custodyOf(collections[0]);
  const same = collections.every(
    (c) =>
      c.heldByUserId === first.held_by_user_id &&
      c.remittedAt === first.remitted_at &&
      c.remittedBy === first.remitted_by,
  );
  return same ? first : null;
}
