import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbCustomer, DbProduct, DbSale, DbSaleItem } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { FindSalesOptions } from '../utils/types';
import type { CreateSalePayload, ISaleRepository } from './ISaleRepository';

function dayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}
function nextDayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

/** SQLite-backed sales repository. Reproduces
 *  `'*, sale_items(*, products(*)), customers(*)'`. */
export class OfflineSaleRepository extends OfflineBaseRepository implements ISaleRepository {
  private async hydrate(sales: DbSale[]): Promise<DbSale[]> {
    if (sales.length === 0) return sales;
    const itemsByParent = await this.childrenByParent<DbSaleItem>(
      'sale_items',
      'sale_id',
      sales.map((s) => s.id),
      'created_at',
    );
    const productIds: string[] = [];
    for (const arr of itemsByParent.values()) for (const it of arr) productIds.push(it.product_id);
    const products = await this.rowsById<DbProduct>('products', productIds);
    const customers = await this.rowsById<DbCustomer>(
      'customers',
      sales.map((s) => s.customer_id).filter((c): c is string => !!c),
    );
    return sales.map((s) => ({
      ...s,
      sale_items: (itemsByParent.get(s.id) ?? []).map((it) => ({
        ...it,
        products: products.get(it.product_id) ?? null,
      })),
      customers: s.customer_id ? customers.get(s.customer_id) ?? null : null,
    }));
  }

  async findAll(opts: FindSalesOptions = {}): Promise<DbSale[]> {
    const page = opts.page ?? 0;
    const parts: { clause: string; params: unknown[] }[] = [];
    if (!opts.includeVoided) parts.push({ clause: 's.voided_at IS NULL', params: [] });
    if (opts.customerId !== undefined && opts.customerId !== null)
      parts.push({ clause: 's.customer_id = ?', params: [opts.customerId] });
    if (opts.productId)
      parts.push({
        clause: 'EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = ?)',
        params: [opts.productId],
      });
    if (opts.fromDate) parts.push({ clause: 's.sold_at >= ?', params: [dayStartIso(opts.fromDate)] });
    if (opts.toDate) parts.push({ clause: 's.sold_at < ?', params: [nextDayStartIso(opts.toDate)] });
    const term = opts.searchQuery?.trim().replace(/[,()]/g, '');
    if (term) {
      const like = `%${term}%`;
      parts.push({
        clause: '(s.items_summary LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE)',
        params: [like, like],
      });
    }
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.sales, 's'));

    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT s.* FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
       ${sql} ORDER BY s.sold_at DESC LIMIT ${OFFLINE_PAGE_SIZE} OFFSET ${page * OFFLINE_PAGE_SIZE}`,
      params,
    );
    return this.hydrate(this.decodeAll<DbSale>('sales', rows));
  }

  async findByCustomer(customerId: string, limit = 20): Promise<DbSale[]> {
    const rows = await this.all(
      'SELECT * FROM sales WHERE customer_id = ? AND voided_at IS NULL ORDER BY sold_at DESC LIMIT ?',
      [customerId, limit],
    );
    return this.hydrate(this.decodeAll<DbSale>('sales', rows));
  }

  async findById(id: string): Promise<DbSale | null> {
    const row = await this.first('SELECT * FROM sales WHERE id = ?', [id]);
    if (!row) return null;
    const [hydrated] = await this.hydrate([this.decodeOne<DbSale>('sales', row)!]);
    return hydrated;
  }

  async create(payload: CreateSalePayload): Promise<DbSale> {
    const { items, ...header } = payload;
    const now = nowIso();
    const saleId = newId();
    const saleRow: DbSale = {
      ...header,
      id: saleId,
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      remitted_at: null,
      remitted_by: null,
    };
    const itemRows: DbSaleItem[] = items.map((it) => ({
      ...it,
      id: newId(),
      sale_id: saleId,
      created_at: now,
      updated_at: now,
    }));
    // Header + all lines in one local transaction (atomic offline; the generic
    // sync pushes them separately, parents-before-children).
    await this.write(async (db) => {
      await insertDirty(db, 'sales', saleRow);
      for (const it of itemRows) await insertDirty(db, 'sale_items', it);
    });
    const created = await this.findById(saleId);
    return created as DbSale;
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale> {
    const now = nowIso();
    await this.write((db) =>
      db.runAsync(
        `UPDATE sales SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      ),
    );
    const row = await this.first('SELECT * FROM sales WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Sale not found'));
    const [hydrated] = await this.hydrate([this.decodeOne<DbSale>('sales', row)!]);
    return hydrated;
  }

  async totalsForMonth(
    monthStart: string,
    monthEndExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.sales, 's');
    const rows = await this.all<{ total_amount: string; rate_per_usd_snapshot: string }>(
      `SELECT s.total_amount, s.rate_per_usd_snapshot FROM sales s
       WHERE s.sold_at >= ? AND s.sold_at < ? AND s.voided_at IS NULL
         ${branch.clause ? `AND ${branch.clause}` : ''}`,
      [monthStart, monthEndExclusive, ...branch.params],
    );
    return rows.map((r) => ({
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async totalsInRange(
    rangeStart: string,
    rangeEndExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.sales, 's');
    const rows = await this.all<{ sold_at: string; total_amount: string; rate_per_usd_snapshot: string }>(
      `SELECT s.sold_at, s.total_amount, s.rate_per_usd_snapshot FROM sales s
       WHERE s.sold_at >= ? AND s.sold_at < ? AND s.voided_at IS NULL
         ${branch.clause ? `AND ${branch.clause}` : ''}`,
      [rangeStart, rangeEndExclusive, ...branch.params],
    );
    return rows.map((r) => ({
      soldAt: r.sold_at,
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  // Same filters as findAll but unpaginated + a lean projection — used to
  // compute the true per-month total when a month holds more rows than one
  // findAll page.
  async monthlyTotals(
    opts: FindSalesOptions = {},
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    const parts: { clause: string; params: unknown[] }[] = [];
    if (!opts.includeVoided) parts.push({ clause: 's.voided_at IS NULL', params: [] });
    if (opts.customerId !== undefined && opts.customerId !== null)
      parts.push({ clause: 's.customer_id = ?', params: [opts.customerId] });
    if (opts.productId)
      parts.push({
        clause: 'EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = ?)',
        params: [opts.productId],
      });
    if (opts.fromDate) parts.push({ clause: 's.sold_at >= ?', params: [dayStartIso(opts.fromDate)] });
    if (opts.toDate) parts.push({ clause: 's.sold_at < ?', params: [nextDayStartIso(opts.toDate)] });
    const term = opts.searchQuery?.trim().replace(/[,()]/g, '');
    if (term) {
      const like = `%${term}%`;
      parts.push({
        clause: '(s.items_summary LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE)',
        params: [like, like],
      });
    }
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.sales, 's'));

    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all<{ sold_at: string; total_amount: string; rate_per_usd_snapshot: string }>(
      `SELECT s.sold_at, s.total_amount, s.rate_per_usd_snapshot FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       ${sql}`,
      params,
    );
    return rows.map((r) => ({
      soldAt: r.sold_at,
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async partialSales(branchFilter: BranchFilter = null): Promise<DbSale[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.sales, 's');
    const rows = await this.all(
      `SELECT s.* FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.voided_at IS NULL AND s.customer_id IS NOT NULL
         AND (CAST(s.total_amount AS REAL) - COALESCE(CAST(s.amount_paid AS REAL), 0)) > 0
         ${branch.clause ? `AND ${branch.clause}` : ''}
       ORDER BY s.sold_at DESC`,
      [...branch.params],
    );
    return this.hydrate(this.decodeAll<DbSale>('sales', rows));
  }

  async unremittedForWallet(
    branchFilter: BranchFilter = null,
    collectorUserId: string | null = null,
  ): Promise<DbSale[]> {
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'CAST(s.amount_paid AS REAL) > 0', params: [] },
      { clause: 's.voided_at IS NULL', params: [] },
      { clause: 's.remitted_at IS NULL', params: [] },
    ];
    if (collectorUserId)
      parts.push({ clause: 's.recorded_by_user_id = ?', params: [collectorUserId] });
    parts.push(this.branchWhere(branchFilter, this.BRANCH_SCOPES.sales, 's'));
    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all(`SELECT s.* FROM sales s ${sql} ORDER BY s.sold_at DESC`, params);
    return this.hydrate(this.decodeAll<DbSale>('sales', rows));
  }

  async markRemitted(ids: string[], remittedBy: string): Promise<void> {
    if (ids.length === 0) return;
    const now = nowIso();
    const ph = ids.map(() => '?').join(', ');
    await this.write((db) =>
      db.runAsync(
        `UPDATE sales SET remitted_at = ?, remitted_by = ?, updated_at = ?, _dirty = 1
         WHERE id IN (${ph}) AND remitted_at IS NULL AND voided_at IS NULL`,
        [now, remittedBy, now, ...ids] as never[],
      ),
    );
  }
}
