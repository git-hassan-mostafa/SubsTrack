import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbPlan } from "@shared/core/types/db";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type { IPlanRepository } from "@shared/modules/admin/plans/repository/IPlanRepository";
import type { PlanPageQuery } from "@shared/modules/admin/plans/utils/types";
import type { PlanPriceChangePayload } from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";

export class PlanRepository extends BaseRepository implements IPlanRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbPlan[]> {
    let query = this.db.from("plans").select("*").order("name");
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.plans,
    );
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbPlan[];
  }

  async findPage(query: PlanPageQuery): Promise<Page<DbPlan>> {
    let request = this.db
      .from("plans")
      .select("*", { count: "exact" })
      .order("name")
      .order("id")
      .range(query.offset, query.offset + query.limit - 1);
    request = this.applyBranchFilter(
      request,
      query.branch,
      this.BRANCH_SCOPES.plans,
    );
    const term = sanitizeSearchTerm(query.search);
    if (term) request = request.ilike("name", `%${term}%`);
    const { data, error, count } = await request;
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbPlan[], total: count ?? 0 };
  }

  async create(payload: Omit<DbPlan, "id" | "created_at">): Promise<DbPlan> {
    const { data, error } = await this.db
      .from("plans")
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbPlan;
    this.audit({
      table: "plans",
      recordId: created.id,
      action: "create",
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbPlan,
        | "name"
        | "price"
        | "is_custom_price"
        | "duration_months"
        | "currency_id"
        | "branch_id"
      >
    >,
  ): Promise<DbPlan> {
    return this.auditedUpdate<DbPlan>("plans", id, payload);
  }

  async updateWithPriceChange(
    id: string,
    payload: Pick<
      DbPlan,
      | "name"
      | "price"
      | "is_custom_price"
      | "duration_months"
      | "currency_id"
      | "branch_id"
    >,
    firstChange: PlanPriceChangePayload,
    nextChange: Pick<PlanPriceChangePayload, "id" | "from_month" | "created_at">,
  ): Promise<DbPlan> {
    const { data: prior } = await this.db
      .from("plans")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const { data, error } = await this.db.rpc("update_plan_with_price_history", {
      p_plan_id: id,
      p_name: payload.name,
      p_price: payload.price,
      p_is_custom_price: payload.is_custom_price,
      p_duration_months: payload.duration_months,
      p_currency_id: payload.currency_id,
      p_branch_id: payload.branch_id,
      p_initial_id: firstChange.id,
      p_initial_price: firstChange.price,
      p_initial_currency_id: firstChange.currency_id,
      p_initial_duration_months: firstChange.duration_months,
      p_initial_is_custom_price: firstChange.is_custom_price,
      p_initial_created_at: firstChange.created_at,
      p_change_id: nextChange.id,
      p_change_from_month: nextChange.from_month,
      p_change_created_at: nextChange.created_at,
    });
    if (error) this.handleError(error);
    const updated = data as unknown as DbPlan;
    this.audit({
      table: "plans",
      recordId: id,
      action: "update",
      before: prior,
      after: updated,
      branchId: updated.branch_id,
    });
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbPlan>("plans", ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from("plans")
      .select("id", { count: "exact", head: true });
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.plans,
    );
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }
}
