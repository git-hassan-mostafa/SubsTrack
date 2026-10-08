import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbPlan } from "@shared/core/types/db";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type { IPlanRepository } from "@shared/modules/admin/plans/repository/IPlanRepository";
import type { PlanPageQuery } from "@shared/modules/admin/plans/utils/types";

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

  async findByIds(ids: string[]): Promise<DbPlan[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db.from("plans").select("*").in("id", ids);
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
