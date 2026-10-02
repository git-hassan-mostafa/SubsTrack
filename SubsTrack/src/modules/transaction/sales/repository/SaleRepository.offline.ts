import { OFFLINE_PAGE_SIZE, type BranchFilter } from "@shared/core/constants";
import type {
  DbCharge,
  DbCustomer,
  DbProduct,
  DbSale,
  DbSaleItem,
  DbService,
  DbStockMovement,
} from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { insertDirty, updateDirty } from "@/src/core/offline/db/dml";
import { newId, nowIso } from "@shared/core/utils/ids";
import type { Page } from "@shared/core/types";
import type {
  FindSalesOptions,
  SalePageQuery,
} from "@shared/modules/transaction/sales/utils/types";
import type {
  CreateSalePayload,
  ISaleRepository,
  UpdateSalePayload,
} from "@shared/modules/transaction/sales/repository/ISaleRepository";
import { dayStartIso, nextDayStartIso } from "@shared/core/utils/dateRange";
import {
  isReceiptIdTerm,
  receiptIdTerm,
  RECEIPT_ID_LENGTH,
} from "@shared/core/utils/receiptId";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";

interface WherePart {
  clause: string;
  params: unknown[];
}

const SALE_CUSTOMER_JOIN = "LEFT JOIN customers c ON s.customer_id = c.id";
const SALE_LIST_ORDER = "s.sold_at DESC, s.created_at DESC, s.id DESC";

// Customer name over the LEFT JOIN, receipt number from the TEXT id's tail.
function saleSearchWhere(searchQuery?: string): {
  clause: string;
  params: unknown[];
} {
  const term = sanitizeSearchTerm(searchQuery);
  if (!term) return { clause: "", params: [] };
  const like = `%${term}%`;
  const clauses = [
    "s.items_summary LIKE ? COLLATE NOCASE",
    "c.name LIKE ? COLLATE NOCASE",
  ];
  const params: unknown[] = [like, like];
  if (isReceiptIdTerm(term)) {
    clauses.push(`SUBSTR(s.id, -${RECEIPT_ID_LENGTH}) LIKE ? COLLATE NOCASE`);
    params.push(`%${receiptIdTerm(term)}%`);
  }
  return { clause: `(${clauses.join(" OR ")})`, params };
}

// Rebuilds the sale embeds (items, products, services, customer) from SQLite.
export class OfflineSaleRepository
  extends OfflineBaseRepository
  implements ISaleRepository
{
  private async hydrate(sales: DbSale[]): Promise<DbSale[]> {
    if (sales.length === 0) return sales;
    const itemsByParent = await this.childrenByParent<DbSaleItem>(
      "sale_items",
      "sale_id",
      sales.map((s) => s.id),
      "created_at",
    );
    const productIds: string[] = [];
    const serviceIds: string[] = [];
    for (const arr of itemsByParent.values()) {
      for (const it of arr) {
        if (it.product_id) productIds.push(it.product_id);
        if (it.service_id) serviceIds.push(it.service_id);
      }
    }
    const [products, services, customers] = await Promise.all([
      this.rowsById<DbProduct>("products", productIds),
      this.rowsById<DbService>("services", serviceIds),
      this.rowsById<DbCustomer>(
        "customers",
        sales.map((s) => s.customer_id).filter((c): c is string => !!c),
      ),
    ]);
    return sales.map((s) => ({
      ...s,
      sale_items: (itemsByParent.get(s.id) ?? []).map((it) => ({
        ...it,
        products: it.product_id ? (products.get(it.product_id) ?? null) : null,
        services: it.service_id ? (services.get(it.service_id) ?? null) : null,
      })),
      customers: s.customer_id ? (customers.get(s.customer_id) ?? null) : null,
    }));
  }

  // Every filter but the void ones, which a list and a total read differently.
  private filterWhere(opts: FindSalesOptions): WherePart[] {
    const parts: WherePart[] = [];
    if (opts.customerId)
      parts.push({ clause: "s.customer_id = ?", params: [opts.customerId] });
    if (opts.productId)
      parts.push({
        clause:
          "EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = ? AND si.voided_at IS NULL)",
        params: [opts.productId],
      });
    if (opts.fromDate)
      parts.push({
        clause: "s.sold_at >= ?",
        params: [dayStartIso(opts.fromDate)],
      });
    if (opts.toDate)
      parts.push({
        clause: "s.sold_at < ?",
        params: [nextDayStartIso(opts.toDate)],
      });
    parts.push(saleSearchWhere(opts.searchQuery));
    parts.push(
      this.branchWhere(
        opts.branchFilter ?? null,
        this.BRANCH_SCOPES.sales,
        "s",
      ),
    );
    return parts;
  }

  private listWhere(opts: FindSalesOptions): { sql: string; params: unknown[] } {
    const parts = this.filterWhere(opts);
    if (!opts.includeVoided)
      parts.push({ clause: "s.voided_at IS NULL", params: [] });
    if (opts.voidedOnly)
      parts.push({ clause: "s.voided_at IS NOT NULL", params: [] });
    return this.combineWhere(parts);
  }

  private async listRows(
    opts: FindSalesOptions,
    limit: number,
    offset: number,
  ): Promise<DbSale[]> {
    const { sql, params } = this.listWhere(opts);
    const rows = await this.all(
      `SELECT s.* FROM sales s ${SALE_CUSTOMER_JOIN} ${sql}
       ORDER BY ${SALE_LIST_ORDER} LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return this.hydrate(this.decodeAll<DbSale>("sales", rows));
  }

  findAll(opts: FindSalesOptions = {}): Promise<DbSale[]> {
    const page = opts.page ?? 0;
    return this.listRows(opts, OFFLINE_PAGE_SIZE, page * OFFLINE_PAGE_SIZE);
  }

  async findPage(query: SalePageQuery): Promise<Page<DbSale>> {
    const { sql, params } = this.listWhere(query);
    const [rows, total] = await Promise.all([
      this.listRows(query, query.limit, query.offset),
      this.count(
        `SELECT COUNT(*) AS n FROM sales s ${SALE_CUSTOMER_JOIN} ${sql}`,
        params,
      ),
    ]);
    return { rows, total };
  }

  async findByCustomer(customerId: string, limit = 20): Promise<DbSale[]> {
    const rows = await this.all(
      "SELECT * FROM sales WHERE customer_id = ? AND voided_at IS NULL ORDER BY sold_at DESC LIMIT ?",
      [customerId, limit],
    );
    return this.hydrate(this.decodeAll<DbSale>("sales", rows));
  }

  async findById(id: string): Promise<DbSale | null> {
    const row = await this.first("SELECT * FROM sales WHERE id = ?", [id]);
    if (!row) return null;
    const [hydrated] = await this.hydrate([
      this.decodeOne<DbSale>("sales", row)!,
    ]);
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
    const subject = await this.customerSubject(saleRow.customer_id);
    await this.write(async (db) => {
      await insertDirty(db, "sales", saleRow);
      for (const it of itemRows) await insertDirty(db, "sale_items", it);
      for (const m of movementRows) await insertDirty(db, "stock_movements", m);
      await insertDirty(db, "charges", chargeRow);
      await this.auditIn(db, {
        table: "sales",
        recordId: saleId,
        action: "create",
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
      "sales",
      await this.first(
        "SELECT * FROM sales WHERE id = ? AND voided_at IS NULL",
        [id],
      ),
    );
    if (!before) this.handleError(new Error("Sale not found"));
    const [subject, existing] = await Promise.all([
      this.customerSubject(header.customer_id),
      this.all<{ id: string }>(
        "SELECT id FROM sale_items WHERE sale_id = ? AND voided_at IS NULL ORDER BY created_at",
        [id],
      ),
    ]);

    await this.write(async (db) => {
      await updateDirty(db, "sales", id, { ...header, updated_at: now });

      for (let i = 0; i < items.length; i++) {
        if (i < existing.length) {
          await updateDirty(db, "sale_items", existing[i].id, {
            ...items[i],
            updated_at: now,
          });
        } else {
          await insertDirty(db, "sale_items", {
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
        await updateDirty(db, "sale_items", row.id, {
          voided_at: now,
          updated_at: now,
        });
      }

      if (movements) {
        await db.runAsync(
          `UPDATE stock_movements SET voided_at = ?, voided_by = ?, updated_at = ?, _dirty = 1
           WHERE sale_id = ? AND voided_at IS NULL`,
          [now, actorUserId, now, id] as never[],
        );
        for (const m of movements) {
          await insertDirty(db, "stock_movements", {
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

      const bill = await this.first<{ id: string }>(
        "SELECT id FROM charges WHERE sale_id = ? AND voided_at IS NULL",
        [id],
      );
      if (bill)
        await updateDirty(db, "charges", bill.id, {
          ...charge,
          updated_at: now,
        });

      const after = this.decodeOne<DbSale>(
        "sales",
        await this.first("SELECT * FROM sales WHERE id = ?", [id]),
      );
      if (after) {
        await this.auditIn(db, {
          table: "sales",
          recordId: id,
          action: "update",
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

  async voidSale(
    id: string,
    voidedBy: string,
    reason: string,
  ): Promise<DbSale> {
    const now = nowIso();
    const subject = await this.customerSubject(
      (
        await this.first<{ customer_id: string | null }>(
          "SELECT customer_id FROM sales WHERE id = ?",
          [id],
        )
      )?.customer_id ?? null,
    );
    await this.write(async (db) => {
      const before = this.decodeOne<DbSale>(
        "sales",
        await this.first("SELECT * FROM sales WHERE id = ?", [id]),
      );
      await db.runAsync(
        `UPDATE sales SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
      await db.runAsync(
        `UPDATE stock_movements SET voided_at = ?, voided_by = ?, updated_at = ?, _dirty = 1
         WHERE sale_id = ? AND voided_at IS NULL`,
        [now, voidedBy, now, id] as never[],
      );
      await db.runAsync(
        `UPDATE charges SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE sale_id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
      const after = this.decodeOne<DbSale>(
        "sales",
        await this.first("SELECT * FROM sales WHERE id = ?", [id]),
      );
      if (before && after) {
        await this.auditIn(db, {
          table: "sales",
          recordId: id,
          action: "void",
          before,
          after,
          branchId: after.branch_id,
          subject,
        });
      }
    });
    const row = await this.first("SELECT * FROM sales WHERE id = ?", [id]);
    if (!row) this.handleError(new Error("Sale not found"));
    const [hydrated] = await this.hydrate([
      this.decodeOne<DbSale>("sales", row)!,
    ]);
    return hydrated;
  }

  async countInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const { sql, params } = this.combineWhere([
      { clause: "s.voided_at IS NULL", params: [] },
      {
        clause: "s.sold_at >= ? AND s.sold_at < ?",
        params: [startIso, endExclusiveIso],
      },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.sales, "s"),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM sales s ${sql}`, params);
  }

  async monthlyTotals(
    opts: FindSalesOptions = {},
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    if (opts.voidedOnly) return [];
    const { sql, params } = this.combineWhere([
      ...this.filterWhere(opts),
      { clause: "s.voided_at IS NULL", params: [] },
    ]);
    const rows = await this.all<{
      sold_at: string;
      total_amount: string;
      rate_per_usd_snapshot: string;
    }>(
      `SELECT s.sold_at, s.total_amount, s.rate_per_usd_snapshot FROM sales s
       ${SALE_CUSTOMER_JOIN} ${sql}`,
      params,
    );
    return rows.map((r) => ({
      soldAt: r.sold_at,
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}
