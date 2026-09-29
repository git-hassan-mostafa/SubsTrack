import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { Page } from "@shared/core/types";
import type { DbCurrency } from "@shared/core/types/db";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type { ICurrencyRepository } from "@shared/modules/admin/currencies/repository/ICurrencyRepository";
import type { CurrencyPageQuery } from "@shared/modules/admin/currencies/utils/types";

export class CurrencyRepository
  extends BaseRepository
  implements ICurrencyRepository
{
  async findAll(): Promise<DbCurrency[]> {
    const { data, error } = await this.db
      .from("currencies")
      .select("*")
      .order("active", { ascending: false })
      .order("code");
    if (error) this.handleError(error);
    return (data ?? []) as DbCurrency[];
  }

  async findPage(query: CurrencyPageQuery): Promise<Page<DbCurrency>> {
    let request = this.db
      .from("currencies")
      .select("*", { count: "exact" })
      .order("active", { ascending: false })
      .order("code")
      .order("id")
      .range(query.offset, query.offset + query.limit - 1);
    const term = sanitizeSearchTerm(query.search);
    if (term) request = request.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
    request = this.applyActiveFilter(request, query.status);
    const { data, error, count } = await request;
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbCurrency[], total: count ?? 0 };
  }

  async create(
    payload: Omit<DbCurrency, "id" | "created_at" | "updated_at">,
  ): Promise<DbCurrency> {
    const { data, error } = await this.db
      .from("currencies")
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbCurrency;
    this.audit({
      table: "currencies",
      recordId: created.id,
      action: "create",
      after: created,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbCurrency,
        "code" | "name" | "symbol" | "rate_per_usd" | "decimals" | "active"
      >
    >,
  ): Promise<DbCurrency> {
    return this.auditedUpdate<DbCurrency>("currencies", id, payload, {
      action: payload.active === true ? "restore" : "update",
      branchColumn: null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbCurrency>("currencies", ids, {
      branchColumn: null,
    });
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbCurrency>(
        "currencies",
        id,
        { active: false },
        { branchColumn: null },
      );
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [plans, charges, collections, lines] = await Promise.all([
      this.referencedIdsIn("plans", "currency_id", ids),
      this.referencedIdsIn("charges", "currency_id", ids),
      this.referencedIdsIn("collections", "currency_id", ids),
      this.referencedIdsIn("customer_plans", "custom_currency_id", ids),
    ]);
    return new Set([...plans, ...charges, ...collections, ...lines]);
  }

  async countReferences(id: string): Promise<number> {
    const [plans, charges, collections, lines] = await Promise.all([
      this.db
        .from("plans")
        .select("id", { count: "exact", head: true })
        .eq("currency_id", id),
      this.db
        .from("charges")
        .select("id", { count: "exact", head: true })
        .eq("currency_id", id),
      this.db
        .from("collections")
        .select("id", { count: "exact", head: true })
        .eq("currency_id", id),
      this.db
        .from("customer_plans")
        .select("id", { count: "exact", head: true })
        .eq("custom_currency_id", id),
    ]);
    if (plans.error) this.handleError(plans.error);
    if (charges.error) this.handleError(charges.error);
    if (collections.error) this.handleError(collections.error);
    if (lines.error) this.handleError(lines.error);
    return (
      (plans.count ?? 0) +
      (charges.count ?? 0) +
      (collections.count ?? 0) +
      (lines.count ?? 0)
    );
  }
}
