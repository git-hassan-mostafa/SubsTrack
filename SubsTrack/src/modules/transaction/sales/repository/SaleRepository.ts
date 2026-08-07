import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbSale, DbSaleItem } from '@/src/core/types/db';
import { FindSalesOptions } from '../utils/types';
import type { CreateSalePayload, ISaleRepository } from './ISaleRepository';
import { OfflineSaleRepository } from './SaleRepository.offline';

// Header + its lines (each line with its product) + the customer.
const SALE_SELECT = '*, sale_items(*, products(*)), customers(*)';
// Header only. Enough for aggregates/labels (items_summary carries the product
// names) and for create, which gets its lines back from their own insert.
const SALE_SELECT_LEAN = '*, customers(*)';

// Convert a calendar day (YYYY-MM-DD) to the start of that local day as ISO.
function dayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

// Start of the day AFTER the given calendar day — used as an exclusive upper
// bound so a `toDate` filter covers the whole selected day. `d + 1` rolls over
// month/year boundaries correctly via the Date constructor.
function nextDayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

export class SaleRepository extends BaseRepository implements ISaleRepository {
  // Sales that contain a given product — resolved from sale_items, so the
  // product filter still works now that product_id lives on the line, not the
  // sale header.
  private async saleIdsForProduct(productId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('sale_items')
      .select('sale_id')
      .eq('product_id', productId);
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
      .insert(header)
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
        .select('*, products(*)'),
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

  async totalsInRange(
    rangeStart: string,
    rangeEndExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('sales')
      .select('sold_at, amount_paid, rate_per_usd_snapshot')
      .gte('sold_at', rangeStart)
      .lt('sold_at', rangeEndExclusive)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map(
      (r: { sold_at: string; amount_paid: number; rate_per_usd_snapshot: number }) => ({
        soldAt: r.sold_at,
        amount: Number(r.amount_paid),
        ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
      }),
    );
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

  async unremittedForWallet(
    branchFilter: BranchFilter = null,
    collectorUserId: string | null = null,
  ): Promise<DbSale[]> {
    // Lean select — the wallet label reads the header items_summary.
    let query = this.db
      .from('sales')
      .select(SALE_SELECT_LEAN)
      .gt('amount_paid', 0)
      .is('voided_at', null)
      .is('remitted_at', null)
      .order('sold_at', { ascending: false });
    if (collectorUserId) query = query.eq('recorded_by_user_id', collectorUserId);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbSale[];
  }

  async markRemitted(ids: string[], remittedBy: string): Promise<void> {
    if (ids.length === 0) return;
    const remittedAt = new Date().toISOString();
    const { error, data } = await this.db
      .from('sales')
      .update({ remitted_at: remittedAt, remitted_by: remittedBy })
      .in('id', ids)
      .is('remitted_at', null)
      .is('voided_at', null)
      // Returned so the trail records only the rows the conditional UPDATE
      // actually moved, not every id the caller passed.
      .select();
    if (error) this.handleError(error);
    const remitted = (data ?? []) as DbSale[];
    for (const s of remitted) {
      // A sale owns its branch_id, so the passed one wins; only the customer name
      // is looked up, in the background, and never for a walk-in sale.
      this.audit({
        table: 'sales',
        recordId: s.id,
        action: 'update',
        before: { ...s, remitted_at: null, remitted_by: null },
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
