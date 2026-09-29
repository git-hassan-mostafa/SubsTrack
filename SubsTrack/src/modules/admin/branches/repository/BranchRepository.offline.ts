import type { Page } from "@shared/core/types";
import type { DbBranch } from "@shared/core/types/db";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type { BranchPageQuery } from "@shared/modules/admin/branches/utils/types";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { insertDirty } from "@/src/core/offline/db/dml";
import { newId, nowIso } from "@shared/core/utils/ids";
import type { IBranchRepository } from "@shared/modules/admin/branches/repository/IBranchRepository";

// The local mirror's branches; same DbBranch shapes as Supabase — see docs/offline.md.
export class OfflineBranchRepository
  extends OfflineBaseRepository
  implements IBranchRepository
{
  async findAll(): Promise<DbBranch[]> {
    const rows = await this.all(
      "SELECT * FROM branches ORDER BY active DESC, name ASC",
    );
    return this.decodeAll<DbBranch>("branches", rows);
  }

  async findPage(query: BranchPageQuery): Promise<Page<DbBranch>> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const term = sanitizeSearchTerm(query.search);
    if (term) {
      clauses.push("name LIKE ? COLLATE NOCASE");
      params.push(`%${term}%`);
    }
    if (query.status !== "all") {
      clauses.push("active = ?");
      params.push(query.status === "active" ? 1 : 0);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows, total] = await Promise.all([
      this.all(
        `SELECT * FROM branches ${where} ORDER BY active DESC, name ASC, id ASC LIMIT ? OFFSET ?`,
        [...params, query.limit, query.offset],
      ),
      this.count(`SELECT COUNT(*) AS n FROM branches ${where}`, params),
    ]);
    return { rows: this.decodeAll<DbBranch>("branches", rows), total };
  }

  async create(
    payload: Omit<DbBranch, "id" | "created_at" | "updated_at">,
  ): Promise<DbBranch> {
    const now = nowIso();
    const row: DbBranch = {
      id: newId(),
      created_at: now,
      updated_at: now,
      ...payload,
    };
    await this.write(async (db) => {
      await insertDirty(db, "branches", row);
      await this.auditIn(db, {
        table: "branches",
        recordId: row.id,
        action: "create",
        after: row,
        branchId: row.id,
      });
    });
    return row;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbBranch, "name" | "active">>,
  ): Promise<DbBranch> {
    const row = await this.auditedUpdate<DbBranch>(
      "branches",
      id,
      { ...payload, updated_at: nowIso() },
      {
        action: payload.active === true ? "restore" : "update",
        branchColumn: "id",
      },
    );
    if (!row) this.handleError(new Error("Branch not found"));
    return row;
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
        { active: false, updated_at: nowIso() },
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
    return this.count("SELECT COUNT(*) AS n FROM branches WHERE active = 1");
  }

  async countActiveAmong(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const ph = ids.map(() => "?").join(", ");
    return this.count(
      `SELECT COUNT(*) AS n FROM branches WHERE active = 1 AND id IN (${ph})`,
      ids,
    );
  }

  async countReferences(id: string): Promise<number> {
    const [users, customers, plans] = await Promise.all([
      this.count("SELECT COUNT(*) AS n FROM users WHERE branch_id = ?", [id]),
      this.count("SELECT COUNT(*) AS n FROM customers WHERE branch_id = ?", [
        id,
      ]),
      this.count("SELECT COUNT(*) AS n FROM plans WHERE branch_id = ?", [id]),
    ]);
    return users + customers + plans;
  }
}
