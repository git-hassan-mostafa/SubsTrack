import type { BranchFilter } from '@/src/core/constants';
import type {
  CollectorWallet,
  CollectorWalletDetail,
  UserRole,
  WalletCurrencyTotal,
  WalletItem,
  WalletSource,
} from '@/src/core/types';
import i18n from '@/src/core/i18n';
import { paymentService } from '@/src/modules/customer/customer-payments';
import { saleService } from '@/src/modules/transaction/sales';
import { debtService } from '@/src/modules/transaction/debts';
import { userService } from '@/src/modules/admin/users';

// A collector wallet is DERIVED, never stored. It composes the three cash
// sources — subscription payments, sales, and debt payments — filtered to the
// rows a user recorded that are not voided and not yet handed over (remitted).
// Marking a row "received" stamps remitted_at/remitted_by, dropping it from the
// wallet. Multi-currency: each row is summed in its own currency (physical cash)
// AND in USD via its frozen snapshot rate (drift-free, same as DebtService).
class WalletService {
  // Every collector's wallet for the branch scope, folded per collector +
  // per currency. Sorted most-cash-first (by USD value).
  async getWalletsView(branchFilter: BranchFilter = null): Promise<CollectorWallet[]> {
    const [items, users] = await Promise.all([
      this.collectItems(branchFilter, null),
      this.userMap(),
    ]);
    const byCollector = new Map<string, WalletItem[]>();
    for (const it of items) {
      const arr = byCollector.get(it.collectorUserId);
      if (arr) arr.push(it);
      else byCollector.set(it.collectorUserId, [it]);
    }
    const wallets = [...byCollector.entries()].map(([id, its]) =>
      this.foldWallet(id, users.get(id), its),
    );
    wallets.sort((a, b) => b.totalUsd - a.totalUsd);
    return wallets;
  }

  // One collector's wallet plus the individual transactions behind it
  // (newest first). Used by the collector detail sheet and the self-view.
  async getWalletDetail(
    collectorUserId: string,
    branchFilter: BranchFilter = null,
  ): Promise<CollectorWalletDetail> {
    const [items, users] = await Promise.all([
      this.collectItems(branchFilter, collectorUserId),
      this.userMap(),
    ]);
    const wallet = this.foldWallet(collectorUserId, users.get(collectorUserId), items);
    const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { ...wallet, items: sorted };
  }

  // Hand over specific transactions (per-transaction settle). Grouped by source
  // and marked remitted in one round-trip each. Admin-only.
  async receiveItems(
    items: { source: WalletSource; id: string }[],
    remittedBy: string,
    callerRole: UserRole,
  ): Promise<void> {
    this.assertAdmin(callerRole);
    const bySource: Record<WalletSource, string[]> = { payment: [], sale: [], debt_payment: [] };
    for (const it of items) bySource[it.source].push(it.id);
    await Promise.all([
      paymentService.markRemitted(bySource.payment, remittedBy),
      saleService.markRemitted(bySource.sale, remittedBy),
      debtService.markDebtPaymentsRemitted(bySource.debt_payment, remittedBy),
    ]);
  }

  // Receive EVERYTHING a collector currently holds — the "receive all" button.
  // Re-reads the collector's current unremitted set first (fresh, avoids acting
  // on a stale list) then marks it all remitted. Admin-only.
  async receiveAllFromCollector(
    collectorUserId: string,
    remittedBy: string,
    callerRole: UserRole,
    branchFilter: BranchFilter = null,
  ): Promise<void> {
    this.assertAdmin(callerRole);
    const items = await this.collectItems(branchFilter, collectorUserId);
    await this.receiveItems(
      items.map((i) => ({ source: i.source, id: i.id })),
      remittedBy,
      callerRole,
    );
  }

  // ── internals ────────────────────────────────────────────────────────────

  // Fan out over the three cash sources and normalise each into a WalletItem.
  // Rows with no collector (received_by/recorded_by NULL) can't belong to a
  // wallet and are skipped.
  private async collectItems(
    branchFilter: BranchFilter,
    collectorUserId: string | null,
  ): Promise<WalletItem[]> {
    const [payments, sales, debtPayments] = await Promise.all([
      paymentService.getUnremittedForWallet(branchFilter, collectorUserId),
      saleService.getUnremittedForWallet(branchFilter, collectorUserId),
      debtService.getUnremittedDebtPayments(branchFilter, collectorUserId),
    ]);

    const items: WalletItem[] = [];
    for (const p of payments) {
      if (!p.receivedByUserId) continue;
      items.push({
        id: p.id,
        source: 'payment',
        collectorUserId: p.receivedByUserId,
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
      if (!s.recordedByUserId) continue;
      items.push({
        id: s.id,
        source: 'sale',
        collectorUserId: s.recordedByUserId,
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
      if (!d.receivedByUserId) continue;
      items.push({
        id: d.id,
        source: 'debt_payment',
        collectorUserId: d.receivedByUserId,
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

  private foldWallet(
    collectorUserId: string,
    user: { fullName: string; active: boolean } | undefined,
    items: WalletItem[],
  ): CollectorWallet {
    const byCurrency = new Map<string, WalletCurrencyTotal>();
    let totalUsd = 0;
    for (const it of items) {
      const key = it.currencyId ?? 'USD';
      const usd = it.amount / it.ratePerUsdSnapshot;
      totalUsd += usd;
      const cur = byCurrency.get(key);
      if (cur) {
        cur.amount += it.amount;
        cur.usd += usd;
      } else {
        byCurrency.set(key, { currencyId: it.currencyId, amount: it.amount, usd });
      }
    }
    return {
      collectorUserId,
      collectorName: user?.fullName ?? i18n.t('wallet.unknown_collector'),
      active: user?.active ?? false,
      byCurrency: [...byCurrency.values()].sort((a, b) => b.usd - a.usd),
      itemCount: items.length,
      totalUsd,
    };
  }

  // id → { fullName, active } for every user visible to the caller (RLS-scoped),
  // so deactivated collectors who still hold cash still resolve to a name.
  private async userMap(): Promise<Map<string, { fullName: string; active: boolean }>> {
    const users = await userService.getUsers(null);
    const map = new Map<string, { fullName: string; active: boolean }>();
    for (const u of users) map.set(u.id, { fullName: u.fullName, active: u.active });
    return map;
  }

  private assertAdmin(role: UserRole): void {
    if (role !== 'admin' && role !== 'superadmin') {
      throw new Error(i18n.t('errors.forbidden'));
    }
  }
}

export default new WalletService();
