import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CollectedRow } from '@/src/core/types';
import type { DbSale, DbSaleItem } from '@/src/core/types/db';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type { CreateStockMovementPayload } from '@/src/modules/admin/products';
import { FindSalesOptions } from '../utils/types';
import type {
  CreateSaleItemPayload,
  CreateSalePayload,
  ISaleRepository,
  UpdateSalePayload,
} from './ISaleRepository';
import { OfflineSaleRepository } from './SaleRepository.offline';
import { dayStartIso, nextDayStartIso } from '@/src/core/utils/dateRange';

// Header + its lines (each with whichever of product/service it sells) + the
// customer. Both joins are LEFT — a line sets only one of the two id columns, and
// a one-off service sets neither.
const SALE_SELECT = '*, sale_items(*, products(*), services(*)), customers(*)';
// One line, with both catalog joins — what a line write reads back.
const SALE_ITEM_SELECT = '*, products(*), services(*)';
// Header only. Enough for aggregates/labels (items_summary carries every line's
// name) and for create, which gets its lines back from their own insert.
const SALE_SELECT_LEAN = '*, customers(*)';

export class SaleRepository extends BaseRepository implements ISaleRepository {
  // Sales that contain a given product — resolved from sale_items, so the
  // product filter still works now that product_id lives on the line, not the
  // sale header.
  private async saleIdsForProduct(productId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('sale_items')
      .select('sale_id')
      .eq('product_id', productId)
      // A line an edit dropped no longer puts this product in the sale.
      .is('voided_at', null);
    if (error) this.handleError(error);
    return Array.from(new Set((data ?? []).map((r: { sale_id: string }) => r.sale_id)));
  }

  async findAll(opts: FindSalesOptions = {}): Promise<DbSale[]> {
    const page = opts.page ?? 0;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = this.db
      .from('sales')
      .select(SALE_SELECT)
      .order('sold_at', { ascending: false })
      .range(from, to);

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.customerId !== undefined && opts.customerId !== null) {
      query = query.eq('customer_id', opts.customerId);
    }
    if (opts.productId) query = query.in('id', await this.saleIdsForProduct(opts.productId));

    // Date range on sold_at. Bounds are calendar days; the end is made
    // inclusive by using the start of the following day as an exclusive bound.
    if (opts.fromDate) query = query.gte('sold_at', dayStartIso(opts.fromDate));
    if (opts.toDate) query = query.lt('sold_at', nextDayStartIso(opts.toDate));

    // Search across the frozen items summary + customer name (via join).
    if (opts.searchQuery?.trim()) {
      const term = opts.searchQuery.trim();
      query = query.or(`items_summary.ilike.%${term}%,customers.name.ilike.%${term}%`);
    }

    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.sales);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbSale[];
  }

  async findByCustomer(customerId: string, limit = 20): Promise<DbSale[]> {
    const { data, error } = await this.db
      .from('sales')
      .select(SALE_SELECT)
      .eq('customer_id', customerId)
      .is('voided_at', null)
      .order('sold_at', { ascending: false })
      .limit(limit);
    if (error) this.handleError(error);
    return (data ?? []) as DbSale[];
  }

  async findById(id: string): Promise<DbSale | null> {
    const { data, error } = await this.db
      .from('sales')
      .select(SALE_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data ?? null) as DbSale | null;
  }

  async create(payload: CreateSalePayload): Promise<DbSale> {
    const { items, movements, ...header } = payload;
    // The header must land first — the lines and the stock ledger both FK to it.
    // It returns its own joined customer so no read-back is needed afterwards.
    const { data: sale, error } = await this.db
      .from('sales')
      // The cash starts in the recording user's wallet.
      .insert({ ...header, held_by_user_id: header.recorded_by_user_id })
      .select(SALE_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const created = sale as DbSale;

    // Lines and their stock decrements only depend on the header, so they go out
    // together — one network wave instead of two.
    const [itemsResult, stockResult] = await Promise.all([
      this.db
        .from('sale_items')
        .insert(items.map((it) => ({ ...it, sale_id: created.id })))
        .select(SALE_ITEM_SELECT),
      movements.length > 0
        ? this.db
          .from('stock_movements')
          .insert(movements.map((m) => ({ ...m, sale_id: created.id })))
        : null,
    ]);
    if (itemsResult.error) this.handleError(itemsResult.error);
    if (stockResult?.error) this.handleError(stockResult.error);

    // One entry for the sale as a whole: the lines are already summarized on the
    // header (items_summary) and the movements are their own ledger.
    this.audit({
      table: 'sales',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: created.branch_id,
      // Already joined by SALE_SELECT_LEAN — no lookup needed. A walk-in sale has
      // no customer, so the entry simply has no subject.
      subject: created.customers?.name ?? null,
    });

    // Same shape SALE_SELECT would have returned, assembled from the writes.
    return { ...created, sale_items: (itemsResult.data ?? []) as DbSaleItem[] };
  }

  async update(id: string, payload: UpdateSalePayload): Promise<DbSale> {
    const { items, movements, actorUserId, ...header } = payload;
    // One extra read so the trail can say what the sale WAS. PostgREST cannot
    // return old values from an UPDATE.
    const { data: prior } = await this.db.from('sales').select('*').eq('id', id).maybeSingle();
    const { data, error } = await this.db
      .from('sales')
      .update(header)
      .eq('id', id)
      // A voided sale is a closed record — this filter is what locks it.
      .is('voided_at', null)
      .select(SALE_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const updated = data as DbSale;

    const lines = await this.replaceItems(id, items);
    if (movements) await this.replaceSaleMovements(id, movements, actorUserId);

    // One entry for the sale as a whole, like create/void — the changed header
    // columns (items_summary, total_amount, amount_paid, …) say what moved, and
    // sale_items / stock_movements are deliberately not audited themselves.
    this.audit({
      table: 'sales',
      recordId: id,
      action: 'update',
      before: prior,
      after: updated,
      branchId: updated.branch_id,
      subject: updated.customers?.name ?? null,
    });

    return { ...updated, sale_items: lines };
  }

  // Writes the new line set over the old one, matching by position so a line
  // that merely changed quantity or price keeps its id (a delete would never
  // reach another device's mirror — the sync engine has no tombstones, which is
  // also why the surplus is soft-voided instead of removed).
  private async replaceItems(
    saleId: string,
    items: CreateSaleItemPayload[],
  ): Promise<DbSaleItem[]> {
    const { data: current, error: readError } = await this.db
      .from('sale_items')
      .select('id')
      .eq('sale_id', saleId)
      .is('voided_at', null)
      .order('created_at');
    if (readError) this.handleError(readError);
    const existing = (current ?? []) as { id: string }[];

    const reused = items.slice(0, existing.length);
    const added = items.slice(existing.length);
    const dropped = existing.slice(items.length);

    // Disjoint id sets, so the three go out together — one network wave.
    const [reusedRows, insertResult, dropResult] = await Promise.all([
      Promise.all(
        reused.map(async (it, i) => {
          const { data, error } = await this.db
            .from('sale_items')
            .update(it)
            .eq('id', existing[i].id)
            .select(SALE_ITEM_SELECT)
            .single();
          if (error) this.handleError(error);
          return data as DbSaleItem;
        }),
      ),
      added.length > 0
        ? this.db
          .from('sale_items')
          .insert(added.map((it) => ({ ...it, sale_id: saleId })))
          .select(SALE_ITEM_SELECT)
        : null,
      dropped.length > 0
        ? this.db
          .from('sale_items')
          .update({ voided_at: new Date().toISOString() })
          .in('id', dropped.map((r) => r.id))
        : null,
    ]);
    if (insertResult?.error) this.handleError(insertResult.error);
    if (dropResult?.error) this.handleError(dropResult.error);

    return [...reusedRows, ...((insertResult?.data ?? []) as DbSaleItem[])];
  }

  async updateAmountPaid(id: string, amountPaid: number): Promise<DbSale> {
    // One extra read so the trail can say what the sale WAS — same reason as update().
    const { data: prior } = await this.db.from('sales').select('*').eq('id', id).maybeSingle();
    const { data, error } = await this.db
      .from('sales')
      .update({ amount_paid: amountPaid })
      .eq('id', id)
      // A voided sale is a closed record — this filter is what locks it.
      .is('voided_at', null)
      .select(SALE_SELECT)
      .single();
    if (error) this.handleError(error);
    const updated = data as DbSale;

    this.audit({
      table: 'sales',
      recordId: id,
      action: 'update',
      before: prior,
      after: updated,
      branchId: updated.branch_id,
      subject: updated.customers?.name ?? null,
    });

    return updated;
  }

  // Swaps the sale's stock decrements for the edited ones. The old rows are
  // soft-voided rather than reversed with opposite rows, exactly like voidSale —
  // `IS NULL` keeps a repeated run from crediting the stock twice.
  private async replaceSaleMovements(
    saleId: string,
    movements: Omit<CreateStockMovementPayload, 'sale_id'>[],
    voidedBy: string | null,
  ): Promise<void> {
    const { error: voidError } = await this.db
      .from('stock_movements')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy })
      .eq('sale_id', saleId)
      .is('voided_at', null);
    if (voidError) this.handleError(voidError);
    if (movements.length === 0) return;
    const { error } = await this.db
      .from('stock_movements')
      .insert(movements.map((m) => ({ ...m, sale_id: saleId })));
    if (error) this.handleError(error);
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale> {
    const now = new Date().toISOString();
    const { data: prior } = await this.db.from('sales').select('*').eq('id', id).maybeSingle();
    const { data, error } = await this.db
      .from('sales')
      .update({ voided_at: now, voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      .is('voided_at', null)
      .select(SALE_SELECT)
      .single();
    if (error) this.handleError(error);

    // Give the stock back by voiding the sale's movements rather than inserting
    // opposite ones — `IS NULL` makes a repeat void a no-op instead of crediting
    // the stock twice.
    const { error: stockError } = await this.db
      .from('stock_movements')
      .update({ voided_at: now, voided_by: voidedBy })
      .eq('sale_id', id)
      .is('voided_at', null);
    if (stockError) this.handleError(stockError);

    const voided = data as DbSale;
    this.audit({
      table: 'sales',
      recordId: id,
      action: 'void',
      before: prior,
      after: voided,
      branchId: voided.branch_id,
      subject: voided.customers?.name ?? null,
    });
    return voided;
  }

  // Returns raw totals + their snapshot rate so the service can convert to USD
  // using the frozen rate (drift-free aggregation). Mirrors PaymentRepository.paidAmountsForMonth.
  async totalsForMonth(
    monthStart: string,
    monthEndExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('sales')
      .select('amount_paid, rate_per_usd_snapshot')
      .gte('sold_at', monthStart)
      .lt('sold_at', monthEndExclusive)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { amount_paid: number; rate_per_usd_snapshot: number }) => ({
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  // Sale cash collected in a range, as CollectedRow. `customers` is a LEFT
  // join (not !inner) — a walk-in sale has no customer and must still count.
  async collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<CollectedRow[]> {
    let query = this.db
      .from('sales')
      .select(
        'id, sold_at, amount_paid, currency_id, rate_per_usd_snapshot, recorded_by_user_id, customer_id, branch_id, items_summary, customers(name)',
      )
      .gte('sold_at', startIso)
      .lt('sold_at', endExclusiveIso)
      .gt('amount_paid', 0)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      date: r.sold_at,
      amount: Number(r.amount_paid),
      currencyId: r.currency_id,
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
      branchId: r.branch_id,
      receivedByUserId: r.recorded_by_user_id,
      customerId: r.customer_id,
      customerName: r.customers?.name ?? null,
      planId: null,
      label: r.items_summary ?? null,
    }));
  }

  // Same filters as findAll but unpaginated + a lean projection — used to
  // compute the true per-month total when a month holds more rows than one
  // findAll page (PAGE_SIZE). `customers(name)` stays in the select only
  // because the search filter below references it via dot notation.
  async monthlyTotals(
    opts: FindSalesOptions = {},
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('sales')
      .select('sold_at, amount_paid, rate_per_usd_snapshot, customers(name)');

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.customerId !== undefined && opts.customerId !== null) {
      query = query.eq('customer_id', opts.customerId);
    }
    if (opts.productId) query = query.in('id', await this.saleIdsForProduct(opts.productId));
    if (opts.fromDate) query = query.gte('sold_at', dayStartIso(opts.fromDate));
    if (opts.toDate) query = query.lt('sold_at', nextDayStartIso(opts.toDate));
    if (opts.searchQuery?.trim()) {
      const term = opts.searchQuery.trim();
      query = query.or(`items_summary.ilike.%${term}%,customers.name.ilike.%${term}%`);
    }
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.sales);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { sold_at: string; amount_paid: number; rate_per_usd_snapshot: number }) => ({
      soldAt: r.sold_at,
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async partialSales(branchFilter: BranchFilter = null): Promise<DbSale[]> {
    // Lean select — the debt label reads the header items_summary, no lines needed.
    let query = this.db
      .from('sales')
      .select(SALE_SELECT_LEAN)
      .is('voided_at', null)
      .not('customer_id', 'is', null)
      .order('sold_at', { ascending: false });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    // PostgREST can't compare two columns (total_amount vs amount_paid) in a
    // filter — keep the still-owed rows here (bounded, branch-scoped set).
    return (data ?? []).filter(
      (s: DbSale) => Number(s.total_amount) - Number(s.amount_paid) > 1e-9,
    ) as DbSale[];
  }

  async heldForWallet(
    branchFilter: BranchFilter = null,
    holderUserId: string | null = null,
  ): Promise<DbSale[]> {
    // Lean select — the wallet label reads the header items_summary.
    let query = this.db
      .from('sales')
      .select(SALE_SELECT_LEAN)
      .gt('amount_paid', 0)
      .is('voided_at', null)
      .not('held_by_user_id', 'is', null)
      .order('sold_at', { ascending: false });
    if (holderUserId) query = query.eq('held_by_user_id', holderUserId);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbSale[];
  }

  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const values = custodyValues(toUserId, actorUserId);
    const { error, data } = await this.db
      .from('sales')
      .update(values)
      .in('id', ids)
      // Guarded on the current holder — see PaymentRepository.transferCustody.
      .eq('held_by_user_id', fromUserId)
      .is('voided_at', null)
      // Returned so the trail records only the rows the conditional UPDATE
      // actually moved, not every id the caller passed.
      .select();
    if (error) this.handleError(error);
    const moved = (data ?? []) as DbSale[];
    for (const s of moved) {
      // A sale owns its branch_id, so the passed one wins; only the customer name
      // is looked up, in the background, and never for a walk-in sale.
      this.audit({
        table: 'sales',
        recordId: s.id,
        action: 'update',
        before: { ...s, held_by_user_id: fromUserId, remitted_at: null, remitted_by: null },
        after: s,
        branchId: s.branch_id,
        customerId: s.customer_id,
      });
    }
  }
}

// Platform seam: web → Supabase directly (unchanged); native → offline SQLite.
const impl: ISaleRepository =
  Platform.OS === 'web' ? new SaleRepository() : new OfflineSaleRepository();

export default impl;
