import { BaseRepository } from "@shared/core/utils/BaseRepository";
import { PAGE_SIZE, type BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbSale, DbSaleItem } from "@shared/core/types/db";
import type { CreateStockMovementPayload } from "@shared/modules/admin/products/repository/IProductRepository";
import type {
  FindSalesOptions,
  SalePageQuery,
} from "@shared/modules/transaction/sales/utils/types";
import type {
  CreateSaleItemPayload,
  CreateSalePayload,
  ISaleRepository,
  UpdateSalePayload,
} from "@shared/modules/transaction/sales/repository/ISaleRepository";
import { dayStartIso, nextDayStartIso } from "@shared/core/utils/dateRange";
import { isReceiptIdTerm, receiptIdTerm } from "@shared/core/utils/receiptId";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";

const SALE_SELECT = "*, sale_items(*, products(*), services(*)), customers(*)";
const SALE_ITEM_SELECT = "*, products(*), services(*)";
const SALE_SELECT_LEAN = "*, customers(*)";

const SALE_TOTALS_SELECT = "sold_at, total_amount, rate_per_usd_snapshot";

interface SaleTotalRow {
  sold_at: string;
  total_amount: number;
  rate_per_usd_snapshot: number;
}

interface SaleFilterIds {
  productSaleIds: string[] | null;
  customerIds: string[];
}

interface SaleFilterQuery<T> {
  eq(column: string, value: string): T;
  in(column: string, values: string[]): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  or(filters: string): T;
}

// Customers come in as an id pre-query: or() cannot name an embed column.
function applySaleSearch<T extends { or(filters: string): T }>(
  query: T,
  searchQuery: string | undefined,
  customerIds: string[],
): T {
  const term = sanitizeSearchTerm(searchQuery);
  if (!term) return query;
  const clauses = [`items_summary.ilike.%${term}%`];
  if (customerIds.length > 0)
    clauses.push(`customer_id.in.(${customerIds.join(",")})`);
  if (isReceiptIdTerm(term))
    clauses.push(`receipt_id.ilike.%${receiptIdTerm(term)}%`);
  return query.or(clauses.join(","));
}

export class SaleRepository extends BaseRepository implements ISaleRepository {
  private async saleIdsForProduct(productId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("sale_items")
      .select("sale_id")
      .eq("product_id", productId)
      .is("voided_at", null);
    if (error) this.handleError(error);
    return Array.from(
      new Set((data ?? []).map((r: { sale_id: string }) => r.sale_id)),
    );
  }

  private async customerIdsMatching(searchQuery?: string): Promise<string[]> {
    const term = sanitizeSearchTerm(searchQuery);
    if (!term) return [];
    const { data, error } = await this.db
      .from("customers")
      .select("id")
      .ilike("name", `%${term}%`);
    if (error) this.handleError(error);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  private async filterIds(opts: FindSalesOptions): Promise<SaleFilterIds> {
    const [productSaleIds, customerIds] = await Promise.all([
      opts.productId ? this.saleIdsForProduct(opts.productId) : null,
      this.customerIdsMatching(opts.searchQuery),
    ]);
    return { productSaleIds, customerIds };
  }

  async findAll(opts: FindSalesOptions = {}): Promise<DbSale[]> {
    const from = (opts.page ?? 0) * PAGE_SIZE;
    const ids = await this.filterIds(opts);
    const { data, error } = await this.listQuery(opts, ids, false).range(
      from,
      from + PAGE_SIZE - 1,
    );
    if (error) this.handleError(error);
    return (data ?? []) as DbSale[];
  }

  async findPage(query: SalePageQuery): Promise<Page<DbSale>> {
    const ids = await this.filterIds(query);
    const { data, error, count } = await this.listQuery(query, ids, true).range(
      query.offset,
      query.offset + query.limit - 1,
    );
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbSale[], total: count ?? 0 };
  }

  // One shape for a list read and its page count, so the two never disagree.
  private listQuery(
    opts: FindSalesOptions,
    ids: SaleFilterIds,
    counted: boolean,
  ) {
    let query = this.db
      .from("sales")
      .select(SALE_SELECT, counted ? { count: "exact" } : undefined)
      .order("sold_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (!opts.includeVoided) query = query.is("voided_at", null);
    if (opts.voidedOnly) query = query.not("voided_at", "is", null);
    return this.applyListFilters(query, opts, ids);
  }

  // Every filter but the void ones, which a list and a total read differently.
  private applyListFilters<T extends SaleFilterQuery<T>>(
    query: T,
    opts: FindSalesOptions,
    ids: SaleFilterIds,
  ): T {
    let q = query;
    if (opts.customerId) q = q.eq("customer_id", opts.customerId);
    if (ids.productSaleIds) q = q.in("id", ids.productSaleIds);
    if (opts.fromDate) q = q.gte("sold_at", dayStartIso(opts.fromDate));
    if (opts.toDate) q = q.lt("sold_at", nextDayStartIso(opts.toDate));
    q = applySaleSearch(q, opts.searchQuery, ids.customerIds);
    return this.applyBranchFilter(
      q,
      opts.branchFilter ?? null,
      this.BRANCH_SCOPES.sales,
    );
  }

  async findByCustomer(customerId: string, limit = 20): Promise<DbSale[]> {
    const { data, error } = await this.db
      .from("sales")
      .select(SALE_SELECT)
      .eq("customer_id", customerId)
      .is("voided_at", null)
      .order("sold_at", { ascending: false })
      .limit(limit);
    if (error) this.handleError(error);
    return (data ?? []) as DbSale[];
  }

  async findById(id: string): Promise<DbSale | null> {
    const { data, error } = await this.db
      .from("sales")
      .select(SALE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data ?? null) as DbSale | null;
  }

  async create(payload: CreateSalePayload): Promise<DbSale> {
    const { items, movements, charge, ...header } = payload;
    const { data: sale, error } = await this.db
      .from("sales")
      .insert(header)
      .select(SALE_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const created = sale as DbSale;

    const [itemsResult, stockResult, chargeResult] = await Promise.all([
      items.length > 0
        ? this.db
            .from("sale_items")
            .insert(items.map((it) => ({ ...it, sale_id: created.id })))
            .select(SALE_ITEM_SELECT)
        : null,
      movements.length > 0
        ? this.db
            .from("stock_movements")
            .insert(movements.map((m) => ({ ...m, sale_id: created.id })))
        : null,
      this.db.from("charges").insert({ ...charge, sale_id: created.id }),
    ]);
    if (itemsResult?.error) this.handleError(itemsResult.error);
    if (stockResult?.error) this.handleError(stockResult.error);
    if (chargeResult.error) this.handleError(chargeResult.error);

    this.audit({
      table: "sales",
      recordId: created.id,
      action: "create",
      after: created,
      branchId: created.branch_id,
      subject: created.customers?.name ?? null,
    });

    return {
      ...created,
      sale_items: (itemsResult?.data ?? []) as DbSaleItem[],
    };
  }

  async update(id: string, payload: UpdateSalePayload): Promise<DbSale> {
    const { items, movements, actorUserId, charge, ...header } = payload;
    const [priorResult, { data, error }] = await Promise.all([
      this.db.from("sales").select("*").eq("id", id).maybeSingle(),
      this.db
        .from("sales")
        .update(header)
        .eq("id", id)
        .is("voided_at", null)
        .select(SALE_SELECT_LEAN)
        .single(),
    ]);
    if (error) this.handleError(error);
    const prior = priorResult.data;
    const updated = data as DbSale;

    const [lines, , chargeResult] = await Promise.all([
      this.replaceItems(id, items),
      movements ? this.replaceSaleMovements(id, movements, actorUserId) : null,
      this.db
        .from("charges")
        .update(charge)
        .eq("sale_id", id)
        .is("voided_at", null),
    ]);
    if (chargeResult.error) this.handleError(chargeResult.error);

    this.audit({
      table: "sales",
      recordId: id,
      action: "update",
      before: prior,
      after: updated,
      branchId: updated.branch_id,
      subject: updated.customers?.name ?? null,
    });

    return { ...updated, sale_items: lines };
  }

  private async replaceItems(
    saleId: string,
    items: CreateSaleItemPayload[],
  ): Promise<DbSaleItem[]> {
    const { data: current, error: readError } = await this.db
      .from("sale_items")
      .select("id")
      .eq("sale_id", saleId)
      .is("voided_at", null)
      .order("created_at");
    if (readError) this.handleError(readError);
    const existing = (current ?? []) as { id: string }[];

    const reused = items.slice(0, existing.length);
    const added = items.slice(existing.length);
    const dropped = existing.slice(items.length);

    const [reusedRows, insertResult, dropResult] = await Promise.all([
      Promise.all(
        reused.map(async (it, i) => {
          const { data, error } = await this.db
            .from("sale_items")
            .update(it)
            .eq("id", existing[i].id)
            .select(SALE_ITEM_SELECT)
            .single();
          if (error) this.handleError(error);
          return data as DbSaleItem;
        }),
      ),
      added.length > 0
        ? this.db
            .from("sale_items")
            .insert(added.map((it) => ({ ...it, sale_id: saleId })))
            .select(SALE_ITEM_SELECT)
        : null,
      dropped.length > 0
        ? this.db
            .from("sale_items")
            .update({ voided_at: new Date().toISOString() })
            .in(
              "id",
              dropped.map((r) => r.id),
            )
        : null,
    ]);
    if (insertResult?.error) this.handleError(insertResult.error);
    if (dropResult?.error) this.handleError(dropResult.error);

    return [...reusedRows, ...((insertResult?.data ?? []) as DbSaleItem[])];
  }

  private async replaceSaleMovements(
    saleId: string,
    movements: Omit<CreateStockMovementPayload, "sale_id">[],
    voidedBy: string | null,
  ): Promise<void> {
    const { error: voidError } = await this.db
      .from("stock_movements")
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy })
      .eq("sale_id", saleId)
      .is("voided_at", null);
    if (voidError) this.handleError(voidError);
    if (movements.length === 0) return;
    const { error } = await this.db
      .from("stock_movements")
      .insert(movements.map((m) => ({ ...m, sale_id: saleId })));
    if (error) this.handleError(error);
  }

  async voidSale(
    id: string,
    voidedBy: string,
    reason: string,
  ): Promise<DbSale> {
    const now = new Date().toISOString();
    const [priorResult, { data, error }] = await Promise.all([
      this.db.from("sales").select("*").eq("id", id).maybeSingle(),
      this.db
        .from("sales")
        .update({ voided_at: now, voided_by: voidedBy, void_reason: reason })
        .eq("id", id)
        .is("voided_at", null)
        .select(SALE_SELECT)
        .single(),
    ]);
    if (error) this.handleError(error);
    const prior = priorResult.data;

    const [stockResult, chargeResult] = await Promise.all([
      this.db
        .from("stock_movements")
        .update({ voided_at: now, voided_by: voidedBy })
        .eq("sale_id", id)
        .is("voided_at", null),
      this.db
        .from("charges")
        .update({ voided_at: now, voided_by: voidedBy, void_reason: reason })
        .eq("sale_id", id)
        .is("voided_at", null),
    ]);
    if (stockResult.error) this.handleError(stockResult.error);
    if (chargeResult.error) this.handleError(chargeResult.error);

    const voided = data as DbSale;
    this.audit({
      table: "sales",
      recordId: id,
      action: "void",
      before: prior,
      after: voided,
      branchId: voided.branch_id,
      subject: voided.customers?.name ?? null,
    });
    return voided;
  }

  async countInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    let query = this.db
      .from("sales")
      .select("id", { count: "exact", head: true })
      .gte("sold_at", startIso)
      .lt("sold_at", endExclusiveIso)
      .is("voided_at", null);
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.sales,
    );
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  // A report sums every live sale in the window — gotcha #175.
  findInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<DbSale[]> {
    return this.readEveryRow<DbSale>((from, to) =>
      this.applyBranchFilter(
        this.db
          .from("sales")
          .select(SALE_SELECT, { count: "exact" })
          .is("voided_at", null)
          .gte("sold_at", startIso)
          .lt("sold_at", endExclusiveIso),
        branchFilter,
        this.BRANCH_SCOPES.sales,
      )
        .order("id")
        .range(from, to),
    );
  }

  async monthlyTotals(
    opts: FindSalesOptions = {},
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    if (opts.voidedOnly) return [];
    const ids = await this.filterIds(opts);
    const rows = await this.readEveryRow<SaleTotalRow>((from, to) =>
      this.applyListFilters(
        this.db
          .from("sales")
          .select(SALE_TOTALS_SELECT, { count: "exact" })
          .is("voided_at", null)
          .order("id")
          .range(from, to),
        opts,
        ids,
      ),
    );
    return rows.map((r) => ({
      soldAt: r.sold_at,
      amount: Number(r.total_amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}
