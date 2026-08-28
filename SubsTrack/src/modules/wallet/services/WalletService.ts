import type { BranchFilter } from '@/src/core/constants';
import type { UserWallet, UserWalletDetail, WalletItem } from '@/src/core/types';
import i18n from '@/src/core/i18n';
import { collectionService } from '@/src/modules/ledger';
import { userService } from '@/src/modules/admin/users';
import {
  canCloseOut,
  canReceiveFrom,
  custodyTargetFor,
  receiveBlock,
  type WalletActor,
} from '../utils/custody';
import { groupByCurrency, sumUsd } from '@/src/core/utils/currency';

// A wallet is DERIVED, never stored: the hand-overs (`collections`) a user is
// currently HOLDING (held_by_user_id), not the ones they collected — cash moves
// up the chain (collector → branch admin → tenant-wide admin) and each handover
// re-points that column. ONE source now: a month, a sale and a custom fee are
// all settled by the same row, so there is nothing left to merge. Multi-currency:
// each row is summed in its own currency (physical cash) AND in USD via its
// frozen snapshot rate. Who may take cash from whom lives in utils/custody.ts.

/** One holder, resolved from the user list — what the chain rules need. */
type HolderInfo = WalletActor & { fullName: string; active: boolean };

class WalletService {
  // Every wallet in the branch scope, folded per holder + per currency, with the
  // viewer's own permissions baked into each one. Sorted most-cash-first.
  async getWalletsView(
    viewer: WalletActor,
    branchFilter: BranchFilter = null,
  ): Promise<UserWallet[]> {
    const [items, holders] = await Promise.all([
      this.collectItems(branchFilter, null),
      this.holderMap(),
    ]);
    this.nameCollectors(items, holders);
    const byHolder = new Map<string, WalletItem[]>();
    for (const it of items) {
      const arr = byHolder.get(it.holderUserId);
      if (arr) arr.push(it);
      else byHolder.set(it.holderUserId, [it]);
    }
    const wallets: UserWallet[] = [];
    for (const [id, its] of byHolder) {
      const holder = holders.get(id);
      // A holder the viewer can't even see (users are branch-scoped by RLS) has
      // no name and no place in the chain, so there is nothing to show or act on.
      if (!holder) continue;
      wallets.push(this.foldWallet(holder, viewer, its));
    }
    wallets.sort((a, b) => b.totalUsd - a.totalUsd);
    return wallets;
  }

  // One wallet plus the individual transactions behind it (newest first). Used
  // by the holder detail sheet and the self-view.
  async getWalletDetail(
    holderUserId: string,
    viewer: WalletActor,
    branchFilter: BranchFilter = null,
  ): Promise<UserWalletDetail> {
    const [items, holders] = await Promise.all([
      this.collectItems(branchFilter, holderUserId),
      this.holderMap(),
    ]);
    this.nameCollectors(items, holders);
    const holder = holders.get(holderUserId) ?? this.unknownHolder(holderUserId);
    const wallet = this.foldWallet(holder, viewer, items);
    const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { ...wallet, items: sorted };
  }

  // Take specific transactions off a holder (per-transaction settle). The cash
  // moves into the viewer's wallet — or straight out of the system when the
  // viewer is the owner, who has no wallet.
  async receiveFrom(
    holderUserId: string,
    ids: string[],
    viewer: WalletActor,
  ): Promise<void> {
    await this.assertCanReceive(holderUserId, viewer);
    await this.moveCustody(ids, holderUserId, custodyTargetFor(viewer), viewer.id);
  }

  // Take EVERYTHING a holder is carrying — the "receive all" button. Re-reads
  // their current set first (fresh, avoids acting on a stale list).
  async receiveAllFrom(
    holderUserId: string,
    viewer: WalletActor,
    branchFilter: BranchFilter = null,
  ): Promise<void> {
    await this.assertCanReceive(holderUserId, viewer);
    const items = await this.collectItems(branchFilter, holderUserId);
    await this.moveCustody(
      items.map((i) => i.id),
      holderUserId,
      custodyTargetFor(viewer),
      viewer.id,
    );
  }

  // Settle the viewer's OWN cash: banked, out of the system. The top of the
  // chain needs this exit — nobody above them can take it.
  async closeOut(ids: string[], viewer: WalletActor): Promise<void> {
    this.assertCanCloseOut(viewer);
    await this.moveCustody(ids, viewer.id, null, viewer.id);
  }

  async closeOutAll(viewer: WalletActor, branchFilter: BranchFilter = null): Promise<void> {
    this.assertCanCloseOut(viewer);
    const items = await this.collectItems(branchFilter, viewer.id);
    await this.moveCustody(
      items.map((i) => i.id),
      viewer.id,
      null,
      viewer.id,
    );
  }

  // ── internals ────────────────────────────────────────────────────────────

  // The one write — one table, one round-trip, guarded on the current holder.
  private async moveCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    await collectionService.transferCustody(ids, fromUserId, toUserId, actorUserId);
  }

  // Every hand-over in scope that somebody is holding, as WalletItems. Rows
  // nobody holds are already excluded by the query; a row with no recorder still
  // resolves (the holder is what a wallet groups on).
  private async collectItems(
    branchFilter: BranchFilter,
    holderUserId: string | null,
  ): Promise<WalletItem[]> {
    const held = await collectionService.getHeld(branchFilter, holderUserId);
    const items: WalletItem[] = [];
    for (const c of held) {
      if (!c.heldByUserId) continue;
      items.push({
        id: c.id,
        source: c.kind,
        collectorUserId: c.receivedByUserId ?? c.heldByUserId,
        collectorName: null, // filled by nameCollectors once the holders are known
        holderUserId: c.heldByUserId,
        customerId: c.customerId,
        customerName: c.customerName,
        // What this cash settled — the same labels the history row shows.
        label: c.itemLabels.filter(Boolean).join(', ') || null,
        amount: c.amount,
        currencyId: c.currencyId,
        ratePerUsdSnapshot: c.ratePerUsdSnapshot,
        date: c.receivedAt,
      });
    }
    return items;
  }

  // Name the original collector, but only on cash that has already moved — on
  // an untouched wallet the holder IS the collector and the line is noise.
  private nameCollectors(items: WalletItem[], holders: Map<string, HolderInfo>): void {
    for (const it of items) {
      if (it.collectorUserId === it.holderUserId) continue;
      it.collectorName = holders.get(it.collectorUserId)?.fullName ?? null;
    }
  }

  private foldWallet(holder: HolderInfo, viewer: WalletActor, items: WalletItem[]): UserWallet {
    const byCurrency = groupByCurrency(items);
    const totalUsd = sumUsd(items);
    const isSelf = holder.id === viewer.id;
    return {
      holderUserId: holder.id,
      holderName: holder.fullName,
      active: holder.active,
      byCurrency,
      itemCount: items.length,
      totalUsd,
      isSelf,
      receiveBlock: receiveBlock(viewer, holder),
      canCloseOut: isSelf && canCloseOut(viewer),
    };
  }

  // id → the holder facts the chain rules need, for every user visible to the
  // caller (RLS-scoped), so a deactivated holder still resolves to a name.
  private async holderMap(): Promise<Map<string, HolderInfo>> {
    const users = await userService.getUsers(null);
    const map = new Map<string, HolderInfo>();
    for (const u of users) {
      map.set(u.id, {
        id: u.id,
        role: u.role,
        branchId: u.branchId,
        fullName: u.fullName,
        active: u.active,
      });
    }
    return map;
  }

  // A holder the viewer can't resolve: named "Unknown" and, being rank-less,
  // never receivable. Only reachable from the detail view (the list drops them).
  private unknownHolder(id: string): HolderInfo {
    return {
      id,
      role: 'superadmin', // the top rank — nobody outranks it, so nobody can receive
      branchId: null,
      fullName: i18n.t('wallet.unknown_collector'),
      active: false,
    };
  }

  private async assertCanReceive(holderUserId: string, viewer: WalletActor): Promise<void> {
    const holder = (await this.holderMap()).get(holderUserId);
    if (!holder || !canReceiveFrom(viewer, holder)) {
      throw new Error(i18n.t('errors.forbidden'));
    }
  }

  private assertCanCloseOut(viewer: WalletActor): void {
    if (!canCloseOut(viewer)) throw new Error(i18n.t('errors.forbidden'));
  }
}

export default new WalletService();
