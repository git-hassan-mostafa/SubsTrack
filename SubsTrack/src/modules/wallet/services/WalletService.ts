import type { BranchFilter } from '@/src/core/constants';
import type {
  UserWallet,
  UserWalletDetail,
  WalletItem,
  WalletSource,
} from '@/src/core/types';
import i18n from '@/src/core/i18n';
import { paymentService } from '@/src/modules/customer/customer-payments';
import { saleService } from '@/src/modules/transaction/sales';
import { debtService } from '@/src/modules/transaction/debts';
import { userService } from '@/src/modules/admin/users';
import {
  canCloseOut,
  canReceiveFrom,
  custodyTargetFor,
  receiveBlock,
  type WalletActor,
} from '../utils/custody';
import { groupByCurrency, sumUsd } from '@/src/core/utils/currency';

// A wallet is DERIVED, never stored. It composes the three cash sources —
// subscription payments, sales, and debt payments — filtered to the rows a user
// is currently HOLDING (held_by_user_id), not the rows they collected: cash
// moves up the chain (collector → branch admin → tenant-wide admin) and each
// handover re-points that column. Multi-currency: each row is summed in its own
// currency (physical cash) AND in USD via its frozen snapshot rate (drift-free,
// same as DebtService). Who may take cash from whom lives in utils/custody.ts.

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
    items: { source: WalletSource; id: string }[],
    viewer: WalletActor,
  ): Promise<void> {
    await this.assertCanReceive(holderUserId, viewer);
    await this.moveCustody(items, holderUserId, custodyTargetFor(viewer), viewer.id);
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
      items.map((i) => ({ source: i.source, id: i.id })),
      holderUserId,
      custodyTargetFor(viewer),
      viewer.id,
    );
  }

  // Settle the viewer's OWN cash: banked, out of the system. The top of the
  // chain needs this exit — nobody above them can take it.
  async closeOut(
    items: { source: WalletSource; id: string }[],
    viewer: WalletActor,
  ): Promise<void> {
    this.assertCanCloseOut(viewer);
    await this.moveCustody(items, viewer.id, null, viewer.id);
  }

  async closeOutAll(viewer: WalletActor, branchFilter: BranchFilter = null): Promise<void> {
    this.assertCanCloseOut(viewer);
    const items = await this.collectItems(branchFilter, viewer.id);
    await this.moveCustody(
      items.map((i) => ({ source: i.source, id: i.id })),
      viewer.id,
      null,
      viewer.id,
    );
  }

  // ── internals ────────────────────────────────────────────────────────────

  // The one write. Groups by source and moves each set in one round-trip.
  private async moveCustody(
    items: { source: WalletSource; id: string }[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    const bySource: Record<WalletSource, string[]> = { payment: [], sale: [], debt_payment: [] };
    for (const it of items) bySource[it.source].push(it.id);
    await Promise.all([
      paymentService.transferCustody(bySource.payment, fromUserId, toUserId, actorUserId),
      saleService.transferCustody(bySource.sale, fromUserId, toUserId, actorUserId),
      debtService.transferDebtPaymentCustody(
        bySource.debt_payment,
        fromUserId,
        toUserId,
        actorUserId,
      ),
    ]);
  }

  // Fan out over the three cash sources and normalise each into a WalletItem.
  // Rows nobody holds are already excluded by the queries; rows with no
  // collector still resolve (the holder is what a wallet groups on).
  private async collectItems(
    branchFilter: BranchFilter,
    holderUserId: string | null,
  ): Promise<WalletItem[]> {
    const [payments, sales, debtPayments] = await Promise.all([
      paymentService.getHeldForWallet(branchFilter, holderUserId),
      saleService.getHeldForWallet(branchFilter, holderUserId),
      debtService.getHeldDebtPayments(branchFilter, holderUserId),
    ]);

    const items: WalletItem[] = [];
    for (const p of payments) {
      if (!p.heldByUserId) continue;
      items.push({
        id: p.id,
        source: 'payment',
        collectorUserId: p.receivedByUserId ?? p.heldByUserId,
        collectorName: null, // filled by nameCollectors once the holders are known
        holderUserId: p.heldByUserId,
        customerId: p.customerId,
        customerName: p.customerName || null,
        label: p.planName,
        amount: p.amountPaid,
        currencyId: p.currencyId,
        ratePerUsdSnapshot: p.ratePerUsdSnapshot,
        date: p.paidAt,
      });
    }
    for (const s of sales) {
      if (!s.heldByUserId) continue;
      items.push({
        id: s.id,
        source: 'sale',
        collectorUserId: s.recordedByUserId ?? s.heldByUserId,
        collectorName: null,
        holderUserId: s.heldByUserId,
        customerId: s.customerId,
        customerName: s.customer?.name ?? null,
        label: s.itemsSummary,
        amount: s.amountPaid,
        currencyId: s.currencyId,
        ratePerUsdSnapshot: s.ratePerUsdSnapshot,
        date: s.soldAt,
      });
    }
    for (const d of debtPayments) {
      if (!d.heldByUserId) continue;
      items.push({
        id: d.id,
        source: 'debt_payment',
        collectorUserId: d.receivedByUserId ?? d.heldByUserId,
        collectorName: null,
        holderUserId: d.heldByUserId,
        customerId: d.customerId,
        customerName: d.customerName || null,
        label: null,
        amount: d.amount,
        currencyId: d.currencyId,
        ratePerUsdSnapshot: d.ratePerUsdSnapshot,
        date: d.paidAt,
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
