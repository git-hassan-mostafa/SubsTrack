import type { ReceiveBlock, UserRole } from '@/src/core/types';

// Who may take cash from whom. Cash moves UP a four-rung chain and never
// sideways, so one rank function answers every question the wallet asks.
// Pure — no store, no i18n, no React. The service asserts with it before every
// write and the UI reads it to disable an action, so the two can't disagree.

/** The parts of a user that decide their place in the chain. */
export interface WalletActor {
  id: string;
  role: UserRole;
  branchId: string | null; // null = tenant-wide (or an unassigned collector)
}

export const RANK_COLLECTOR = 0;
export const RANK_BRANCH_ADMIN = 1;
export const RANK_TENANT_ADMIN = 2;
export const RANK_OWNER = 3;

export type WalletRank =
  | typeof RANK_COLLECTOR
  | typeof RANK_BRANCH_ADMIN
  | typeof RANK_TENANT_ADMIN
  | typeof RANK_OWNER;

/**
 * A branch admin and a tenant-wide admin share `role = 'admin'` — only
 * `branch_id` separates them (null = tenant-wide), which is why role alone
 * was never enough to decide a handover.
 */
export function walletRank(u: WalletActor): WalletRank {
  if (u.role === 'superadmin') return RANK_OWNER;
  if (u.role === 'admin') return u.branchId === null ? RANK_TENANT_ADMIN : RANK_BRANCH_ADMIN;
  return RANK_COLLECTOR;
}

/**
 * Why `receiver` cannot take `holder`'s cash — null when they can. Checked in
 * order, so the caption names the first real reason.
 */
export function receiveBlock(receiver: WalletActor, holder: WalletActor): ReceiveBlock {
  if (receiver.id === holder.id) return 'self';
  // Strictly lower only: a peer (two branch admins, two tenant-wide admins) is
  // not "under" anyone, so neither can clear the other's accountability.
  if (walletRank(receiver) <= walletRank(holder)) return 'rank';
  // A branch admin's reach stops at their own branch — an unassigned collector
  // (branchId null) is therefore reachable only from rank 2 up.
  if (walletRank(receiver) === RANK_BRANCH_ADMIN && holder.branchId !== receiver.branchId) {
    return 'branch';
  }
  return null;
}

export function canReceiveFrom(receiver: WalletActor, holder: WalletActor): boolean {
  return receiveBlock(receiver, holder) === null;
}

/**
 * May this user settle their OWN wallet — mark the cash banked and out of the
 * system? The top of the chain needs an exit, or their wallet (and the
 * dashboard cash tile) would only ever grow.
 */
export function canCloseOut(u: WalletActor): boolean {
  return walletRank(u) >= RANK_TENANT_ADMIN;
}

/**
 * Where cash lands when `receiver` receives it: their own wallet, or `null` =
 * out of the system. The owner has no wallet, so cash reaching them has left
 * the chain (the app stamps remitted_at/remitted_by for that same row).
 */
export function custodyTargetFor(receiver: WalletActor): string | null {
  return receiver.role === 'superadmin' ? null : receiver.id;
}
