import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type {
  DbCharge,
  DbCustomer,
  DbProduct,
  DbSale,
  DbSaleItem,
  DbService,
  DbStockMovement,
} from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { FindSalesOptions } from '../utils/types';
import type { CreateSalePayload, ISaleRepository, UpdateSalePayload } from './ISaleRepository';
import { dayStartIso, nextDayStartIso } from '@/src/core/utils/dateRange';

/** SQLite-backed sales repository. Reproduces
 *  `'*, sale_items(*, products(*), services(*)), customers(*)'`. */
export class OfflineSaleRepository extends OfflineBaseRepository implements ISaleRepository {
  private async hydrate(sales: DbSale[]): Promise<DbSale[]> {
    if (sales.length === 0) return sales;
    const itemsByParent = await this.childrenByParent<DbSaleItem>(
      'sale_items',
      'sale_id',
      sales.map((s) => s.id),
      'created_at',
    );
    // A line sets only one of the two id columns — and a one-off typed service
    // sets neither — so both lists are collected with a null guard.
    const productIds: string[] = [];
    const serviceIds: string[] = [];
    for (const arr of itemsByParent.values()) {
      for (const it of arr) {
        if (it.product_id) productIds.push(it.product_id);
        if (it.service_id) serviceIds.push(it.service_id);
      }
    }
    const products = await this.rowsById<DbProduct>('products', productIds);
    const services = await this.rowsById<DbService>('services', serviceIds);
    const customers = await this.rowsById<DbCustomer>(
      'customers',
      sales.map((s) => s.customer_id).filter((c): c is string => !!c),
    );
    return sales.map((s) => ({
      ...s,
      sale_items: (itemsByParent.get(s.id) ?? []).map((it) => ({
        ...it,
        products: it.product_id ? products.get(it.product_id) ?? null : null,
        services: it.service_id ? services.get(it.service_id) ?? null : null,
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
        clause:
          'EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = ? AND si.voided_at IS NULL)',
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
    const { items, movements, charge, ...header } = payload;
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
    };
    const itemRows: DbSaleItem[] = items.map((it) => ({
      ...it,
      id: newId(),
      sale_id: saleId,
      voided_at: null,
      created_at: now,
      updated_at: now,
    }));
    const movementRows: DbStockMovement[] = movements.map((m) => ({
      ...m,
      id: newId(),
      sale_id: saleId,
      voided_at: null,
      voided_by: null,
      created_at: now,
      updated_at: now,
    }));
    const chargeRow: DbCharge = {
      ...charge,
      sale_id: saleId,
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      written_off_at: null,
      written_off_by: null,
      write_off_reason: null,
    };
    // Read before write() — the transaction must stay as short as possible.
    const subject = await this.customerSubject(saleRow.customer_id);
    // Header + all lines + the stock decrements + the bill in one local
    // transaction (atomic offline; the generic sync pushes them separately,
    // parents-before-children).
    await this.write(async (db) => {
      await insertDirty(db, 'sales', saleRow);
      for (const it of itemRows) await insertDirty(db, 'sale_items', it);
      for (const m of movementRows) await insertDirty(db, 'stock_movements', m);
      // The bill lands in the SAME transaction as the sale — a sale that exists
      // but owes nothing would be invisible to every debt surface.
      await insertDirty(db, 'charges', chargeRow);
      // One entry for the sale as a whole: the lines are already summarized on the
      // header (items_summary) and the movements are their own ledger.
      await this.auditIn(db, {
        table: 'sales',
        recordId: saleId,
        action: 'create',
        after: saleRow,
        branchId: saleRow.branch_id,
        subject,
      });
    });
    const created = await this.findById(saleId);
    return created as DbSale;
  }

  async update(id: string, payload: UpdateSalePayload): Promise<DbSale> {
    const { items, movements, actorUserId, charge, ...header } = payload;
    const now = nowIso();
    const before = this.decodeOne<DbSale>(
      'sales',
      await this.first('SELECT * FROM sales WHERE id = ? AND voided_at IS NULL', [id]),
    );
    // A voided sale is a closed record; the web path's `voided_at IS NULL` filter
    // says the same thing by returning no row.
    if (!before) this.handleError(new Error('Sale not found'));
    // Read before write() — the transaction must stay as short as possible.
    const subject = await this.customerSubject(header.customer_id);
    const existing = await this.all<{ id: string }>(
      'SELECT id FROM sale_items WHERE sale_id = ? AND voided_at IS NULL ORDER BY created_at',
      [id],
    );

    // Header + lines + the replacement stock decrements in one local transaction,
    // exactly like create.
    await this.write(async (db) => {
      await updateDirty(db, 'sales', id, { ...header, updated_at: now });

      // Lines are matched to the existing rows by position, so an edited line
      // keeps its id; only a dropped line is soft-voided (a delete would never
      // reach another device — the engine has no tombstones for sale_items).
      for (let i = 0; i < items.length; i++) {
        if (i < existing.length) {
          await updateDirty(db, 'sale_items', existing[i].id, { ...items[i], updated_at: now });
        } else {
          await insertDirty(db, 'sale_items', {
            ...items[i],
            id: newId(),
            sale_id: id,
            voided_at: null,
            created_at: now,
            updated_at: now,
          } satisfies DbSaleItem);
        }
      }
      for (const row of existing.slice(items.length)) {
        await updateDirty(db, 'sale_items', row.id, { voided_at: now, updated_at: now });
      }

      // null = the products and quantities are unchanged, so the ledger is left
      // exactly as it is — a notes fix must not churn every product's history.
      if (movements) {
        // Soft-void, never opposite rows — same reasoning as voidSale.
        await db.runAsync(
          `UPDATE stock_movements SET voided_at = ?, voided_by = ?, updated_at = ?, _dirty = 1
           WHERE sale_id = ? AND voided_at IS NULL`,
          [now, actorUserId, now, id] as never[],
        );
        for (const m of movements) {
          await insertDirty(db, 'stock_movements', {
            ...m,
            id: newId(),
            sale_id: id,
            voided_at: null,
            voided_by: null,
            created_at: now,
            updated_at: now,
          } satisfies DbStockMovement);
        }
      }

      // The bill follows the sale. Money already collected against it lives in
      // its own rows and is untouched — only what is OWED can be re-priced.
      const bill = await this.first<{ id: string }>(
        'SELECT id FROM charges WHERE sale_id = ? AND voided_at IS NULL',
        [id],
      );
      if (bill) await updateDirty(db, 'charges', bill.id, { ...charge, updated_at: now });

      const after = this.decodeOne<DbSale>(
        'sales',
        await this.first('SELECT * FROM sales WHERE id = ?', [id]),
      );
      if (after) {
        await this.auditIn(db, {
          table: 'sales',
          recordId: id,
          action: 'update',
          before,
          after,
          branchId: after.branch_id,
          subject,
        });
      }
    });

    const updated = await this.findById(id);
    return updated as DbSale;
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale> {
    const now = nowIso();
    await this.write(async (db) => {
      const before = this.decodeOne<DbSale>(
        'sales',
        await this.first('SELECT * FROM sales WHERE id = ?', [id]),
      );
      await db.runAsync(
        `UPDATE sales SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
      // Give the stock back by voiding the sale's movements — `IS NULL` makes a
      // repeat void a no-op instead of crediting the stock twice.
      await db.runAsync(
        `UPDATE stock_movements SET voided_at = ?, voided_by = ?, updated_at = ?, _dirty = 1
         WHERE sale_id = ? AND voided_at IS NULL`,
        [now, voidedBy, now, id] as never[],
      );
      // Nothing may still be owed for a sale that never happened. Any money
      // that WAS collected has already been voided by the service.
      await db.runAsync(
        `UPDATE charges SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE sale_id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
      const after = this.decodeOne<DbSale>(
        'sales',
        await this.first('SELECT * FROM sales WHERE id = ?', [id]),
      );
      if (before && after) {
        await this.auditIn(db, {
          table: 'sales',
          recordId: id,
          action: 'void',
          before,
          after,
          branchId: after.branch_id,
          subject: await this.customerSubject(after.customer_id),
        });
      }
    });
    const row = await this.first('SELECT * FROM sales WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Sale not found'));
    const [hydrated] = await this.hydrate([this.decodeOne<DbSale>('sales', row)!]);
    return hydrated;
  }

  async countInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const { sql, params } = this.combineWhere([
      { clause: 's.voided_at IS NULL', params: [] },
      { clause: 's.sold_at >= ? AND s.sold_at < ?', params: [startIso, endExclusiveIso] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.sales, 's'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM sales s ${sql}`, params);
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
        clause:
          'EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = ? AND si.voided_at IS NULL)',
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
    // VALUE SOLD, not cash — the sale document holds no money any more.
    return rows.map((r) => ({
      soldAt: r.sold_at,
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}
