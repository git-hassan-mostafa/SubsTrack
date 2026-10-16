import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbPlan } from "@shared/core/types/db";
import type { PlanPageQuery } from "@shared/modules/admin/plans/utils/types";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { insertDirty, updateDirty } from "@/src/core/offline/db/dml";
import { newId, nowIso } from "@shared/core/utils/ids";
import type {
  IPlanRepository,
  PlanColumns,
} from "@shared/modules/admin/plans/repository/IPlanRepository";
import type { PlanPriceChangePayload } from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";

// DbPlan has no updated_at: the local column serves the pull merge only.
export class OfflinePlanRepository
  extends OfflineBaseRepository
  implements IPlanRepository
{
  async findAll(branchFilter: BranchFilter = null): Promise<DbPlan[]> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.plans, "plans"),
    ]);
    const rows = await this.all(
      `SELECT * FROM plans ${where.sql} ORDER BY name`,
      where.params,
    );
    return this.decodeAll<DbPlan>("plans", rows);
  }

  async findPage(query: PlanPageQuery): Promise<Page<DbPlan>> {
    const where = this.combineWhere([
      this.branchWhere(query.branch, this.BRANCH_SCOPES.plans, "plans"),
      this.searchWhere(["name"], query.search),
    ]);
    const [rows, total] = await Promise.all([
      this.all(
        `SELECT * FROM plans ${where.sql} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
        [...where.params, query.limit, query.offset],
      ),
      this.count(`SELECT COUNT(*) AS n FROM plans ${where.sql}`, where.params),
    ]);
    return { rows: this.decodeAll<DbPlan>("plans", rows), total };
  }

  async create(payload: Omit<DbPlan, "id" | "created_at">): Promise<DbPlan> {
    const row: DbPlan = { id: newId(), created_at: nowIso(), ...payload };
    await this.write(async (db) => {
      await insertDirty(db, "plans", row);
      await this.auditIn(db, {
        table: "plans",
        recordId: row.id,
        action: "create",
        after: row,
        branchId: row.branch_id,
      });
    });
    return row;
  }

  async update(id: string, payload: Partial<PlanColumns>): Promise<DbPlan> {
    const row = await this.auditedUpdate<DbPlan>("plans", id, payload);
    if (!row) this.handleError(new Error("Plan not found"));
    return row;
  }

  async updateWithPriceChange(
    id: string,
    payload: PlanColumns,
    firstChange: PlanPriceChangePayload,
    nextChange: Pick<PlanPriceChangePayload, "id" | "from_month" | "created_at">,
  ): Promise<DbPlan> {
    const row = await this.write(async (db) => {
      const prior = this.decodeOne<DbPlan>(
        "plans",
        await this.first("SELECT * FROM plans WHERE id = ?", [id]),
      );
      if (!prior) throw new Error("Plan not found");
      await updateDirty(db, "plans", id, payload);
      const updated = this.decodeOne<DbPlan>(
        "plans",
        await this.first("SELECT * FROM plans WHERE id = ?", [id]),
      );
      if (!updated) throw new Error("Plan not found");
      const kept = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM plan_price_changes WHERE id = ?",
        [firstChange.id],
      );
      if (!kept) {
        await insertDirty(db, "plan_price_changes", {
          ...firstChange,
          updated_at: firstChange.created_at,
        });
      }
      await insertDirty(db, "plan_price_changes", {
        id: nextChange.id,
        tenant_id: prior.tenant_id,
        plan_id: id,
        from_month: nextChange.from_month,
        price: payload.price,
        currency_id: payload.currency_id,
        duration_months: payload.duration_months,
        is_custom_price: payload.is_custom_price,
        fixed_fee: null,
        created_at: nextChange.created_at,
        updated_at: nextChange.created_at,
      });
      await this.auditIn(db, {
        table: "plans",
        recordId: id,
        action: "update",
        before: prior,
        after: updated,
        branchId: updated.branch_id,
      });
      return updated;
    });
    if (!row) this.handleError(new Error("Plan not found"));
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbPlan>("plans", ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.plans, "plans"),
    ]);
    return this.count(
      `SELECT COUNT(*) AS n FROM plans ${where.sql}`,
      where.params,
    );
  }
}
