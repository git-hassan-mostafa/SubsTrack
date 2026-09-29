import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { Page } from "@shared/core/types";
import type { DbBranch } from "@shared/core/types/db";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type { IBranchRepository } from "@shared/modules/admin/branches/repository/IBranchRepository";
import type { BranchPageQuery } from "@shared/modules/admin/branches/utils/types";

export class BranchRepository
  extends BaseRepository
  implements IBranchRepository
{
  async findAll(): Promise<DbBranch[]> {
    const { data, error } = await this.db
      .from("branches")
      .select("*")
      .order("active", { ascending: false })
      .order("name");
    if (error) this.handleError(error);
    return (data ?? []) as DbBranch[];
  }

  async findPage(query: BranchPageQuery): Promise<Page<DbBranch>> {
    let request = this.db
      .from("branches")
      .select("*", { count: "exact" })
      .order("active", { ascending: false })
      .order("name")
      .order("id")
      .range(query.offset, query.offset + query.limit - 1);
    const term = sanitizeSearchTerm(query.search);
    if (term) request = request.ilike("name", `%${term}%`);
    if (query.status !== "all") {
      request = request.eq("active", query.status === "active");
    }
    const { data, error, count } = await request;
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbBranch[], total: count ?? 0 };
  }

  async create(
    payload: Omit<DbBranch, "id" | "created_at" | "updated_at">,
  ): Promise<DbBranch> {
    const { data, error } = await this.db
      .from("branches")
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbBranch;
    this.audit({
      table: "branches",
      recordId: created.id,
      action: "create",
      after: created,
      branchId: created.id,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbBranch, "name" | "active">>,
  ): Promise<DbBranch> {
    return this.auditedUpdate<DbBranch>("branches", id, payload, {
      action: payload.active === true ? "restore" : "update",
      branchColumn: "id",
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbBranch>("branches", ids, { branchColumn: "id" });
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbBranch>(
        "branches",
        id,
        { active: false },
        { branchColumn: "id" },
      );
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [users, customers, plans] = await Promise.all([
      this.referencedIdsIn("users", "branch_id", ids),
      this.referencedIdsIn("customers", "branch_id", ids),
      this.referencedIdsIn("plans", "branch_id", ids),
    ]);
    return new Set([...users, ...customers, ...plans]);
  }

  async countActive(): Promise<number> {
    const { count, error } = await this.db
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countActiveAmong(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count, error } = await this.db
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("id", ids);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countReferences(id: string): Promise<number> {
    const [users, customers, plans] = await Promise.all([
      this.db
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
      this.db
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
      this.db
        .from("plans")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
    ]);
    if (users.error) this.handleError(users.error);
    if (customers.error) this.handleError(customers.error);
    if (plans.error) this.handleError(plans.error);
    return (users.count ?? 0) + (customers.count ?? 0) + (plans.count ?? 0);
  }
}
