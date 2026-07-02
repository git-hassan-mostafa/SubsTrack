import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbCustomer, DbProduct, DbSale } from '@/src/core/types/db';
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

/** SQLite-backed sales repository. Reproduces `'*, products(*), customers(*)'`. */
export class OfflineSaleRepository extends OfflineBaseRepository implements ISaleRepository {
  private async hydrate(sales: DbSale[]): Promise<DbSale[]> {
    if (sales.length === 0) return sales;
    const products = await this.rowsById<DbProduct>('products', sales.map((s) => s.product_id));
    const customers = await this.rowsById<DbCustomer>(
      'customers',
      sales.map((s) => s.customer_id).filter((c): c is string => !!c),
    );
    return sales.map((s) => ({
      ...s,
      products: products.get(s.product_id) ?? null,
      customers: s.customer_id ? customers.get(s.customer_id) ?? null : null,
    }));
  }

  async findAll(opts: FindSalesOptions = {}): Promise<DbSale[]> {
    const page = opts.page ?? 0;
    const parts: { clause: string; params: unknown[] }[] = [];
    if (!opts.includeVoided) parts.push({ clause: 's.voided_at IS NULL', params: [] });
    if (opts.customerId !== undefined && opts.customerId !== null)
      parts.push({ clause: 's.customer_id = ?', params: [opts.customerId] });
    if (opts.productId) parts.push({ clause: 's.product_id = ?', params: [opts.productId] });
    if (opts.fromDate) parts.push({ clause: 's.sold_at >= ?', params: [dayStartIso(opts.fromDate)] });
    if (opts.toDate) parts.push({ clause: 's.sold_at < ?', params: [nextDayStartIso(opts.toDate)] });
    const term = opts.searchQuery?.trim().replace(/[,()]/g, '');
    if (term) {
      const like = `%${term}%`;
      parts.push({
        clause: '(s.product_name_snapshot LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE)',
        params: [like, like],
      });
    }
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.sales, 's'));

    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT s.* FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
       ${sql} ORDER BY s.sold_at DESC LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`,
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
    const now = nowIso();
    const row: DbSale = {
      ...payload,
      id: newId(),
      total_amount: payload.quantity * payload.unit_amount,
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
    };
    await this.write(async (db, queue) => {
      await insertDirty(db, 'sales', row);
      await queue({ tableName: 'sales', opType: 'insert', rowId: row.id, payload: { row } });
    });    const [hydrated] = await this.hydrate([row]);
    return hydrated;
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale> {
    const now = nowIso();
    await this.write(async (db, queue) => {
      await db.runAsync(
        `UPDATE sales SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
      await queue({
        tableName: 'sales',
        opType: 'void',
        rowId: id,
        payload: { fields: { voided_at: now, voided_by: voidedBy, void_reason: reason } },
      });
    });    const row = await this.first('SELECT * FROM sales WHERE id = ?', [id]);
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
}
