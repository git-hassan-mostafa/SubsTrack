import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbSale } from '@/src/core/types/db';
import { FindSalesOptions } from '../utils/types';

const SALE_SELECT = '*, products(*), customers(*)';

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

class SaleRepository extends BaseRepository {
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
    if (opts.productId) query = query.eq('product_id', opts.productId);

    // Date range on sold_at. Bounds are calendar days; the end is made
    // inclusive by using the start of the following day as an exclusive bound.
    if (opts.fromDate) query = query.gte('sold_at', dayStartIso(opts.fromDate));
    if (opts.toDate) query = query.lt('sold_at', nextDayStartIso(opts.toDate));

    // Search across the snapshotted product name + customer name (via join).
    if (opts.searchQuery?.trim()) {
      const term = opts.searchQuery.trim();
      query = query.or(`product_name_snapshot.ilike.%${term}%,customers.name.ilike.%${term}%`);
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

  async create(
    payload: Omit<
      DbSale,
      'id' | 'total_amount' | 'created_at' | 'voided_at' | 'voided_by' | 'void_reason' | 'products' | 'customers'
    >,
  ): Promise<DbSale> {
    const { data, error } = await this.db
      .from('sales')
      .insert(payload)
      .select(SALE_SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbSale;
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale> {
    const { data, error } = await this.db
      .from('sales')
      .update({
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        void_reason: reason,
      })
      .eq('id', id)
      .is('voided_at', null)
      .select(SALE_SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbSale;
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
      .select('total_amount, rate_per_usd_snapshot')
      .gte('sold_at', monthStart)
      .lt('sold_at', monthEndExclusive)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.sales);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { total_amount: number; rate_per_usd_snapshot: number }) => ({
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}

export default new SaleRepository()
