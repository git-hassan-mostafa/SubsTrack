import type { BranchFilter } from "@shared/core/constants";

export interface ReadStamp {
  branch: BranchFilter;
  version: number;
}

// Taken when a read STARTS, so a write landing mid-read still leaves it stale.
export function readStamp(branch: BranchFilter, version: number): ReadStamp {
  return { branch, version };
}

// A held read stays good until its branch or the change counter it was read at moves.
export function isFreshRead(
  stamp: ReadStamp | null,
  branch: BranchFilter,
  version: number,
): boolean {
  return stamp !== null && stamp.branch === branch && stamp.version === version;
}
