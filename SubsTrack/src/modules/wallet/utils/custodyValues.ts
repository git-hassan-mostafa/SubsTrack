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
