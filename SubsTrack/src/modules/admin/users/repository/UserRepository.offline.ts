import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbUser } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { upsertFromServer } from "@/src/core/offline/db/dml";
import { nowIso } from "@shared/core/utils/ids";
import { isOnline } from "@/src/core/offline/net/connectivity";
import { RequiresConnectionError } from "@shared/core/errors/offlineErrors";
import type { CreateUserPayload, IUserRepository } from "@shared/modules/admin/users/repository/IUserRepository";
import { UserRepository } from "@shared/modules/admin/users/repository/UserRepository";
import type { UserPageQuery } from "@shared/modules/admin/users/utils/types";
import { rolesForFilter } from "@shared/modules/admin/users/utils/userRules";

// Mirror reads + dirty writes; the edge-function writes delegate online-only.
export class OfflineUserRepository
  extends OfflineBaseRepository
  implements IUserRepository
{
  private online = new UserRepository();

  async findAll(branchFilter: BranchFilter = null): Promise<DbUser[]> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.users, "users"),
    ]);
    const rows = await this.all(
      `SELECT * FROM users ${where.sql} ORDER BY username`,
      where.params,
    );
    return this.decodeAll<DbUser>("users", rows);
  }

  async findPage(query: UserPageQuery): Promise<Page<DbUser>> {
    const roles = rolesForFilter(query.role);
    const where = this.combineWhere([
      this.branchWhere(query.branch, this.BRANCH_SCOPES.users, "users"),
      this.searchWhere(["username", "full_name", "phone_number"], query.search),
      this.activeWhere(query.status),
      roles
        ? { clause: `role IN (${roles.map(() => "?").join(", ")})`, params: roles }
        : { clause: "", params: [] },
    ]);
    const [rows, total] = await Promise.all([
      this.all(
        `SELECT * FROM users ${where.sql} ORDER BY active DESC, full_name ASC, id ASC LIMIT ? OFFSET ?`,
        [...where.params, query.limit, query.offset],
      ),
      this.count(`SELECT COUNT(*) AS n FROM users ${where.sql}`, where.params),
    ]);
    return { rows: this.decodeAll<DbUser>("users", rows), total };
  }

  async create(payload: CreateUserPayload): Promise<DbUser> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    const user = await this.online.create(payload);
    await upsertFromServer(this.db, "users", user);
    return user;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbUser,
        "username" | "full_name" | "phone_number" | "role" | "branch_id"
      >
    >,
  ): Promise<DbUser> {
    const row = await this.auditedUpdate<DbUser>("users", id, {
      ...payload,
      updated_at: nowIso(),
    });
    if (!row) this.handleError(new Error("User not found"));
    return row;
  }

  async setActive(id: string, active: boolean): Promise<DbUser> {
    const row = await this.auditedUpdate<DbUser>(
      "users",
      id,
      { active, updated_at: nowIso() },
      { action: active ? "restore" : "update" },
    );
    if (!row) this.handleError(new Error("User not found"));
    return row;
  }

  async countPayments(id: string): Promise<number> {
    return this.count(
      "SELECT COUNT(*) AS n FROM collections WHERE received_by_user_id = ? OR held_by_user_id = ?",
      [id, id],
    );
  }

  async usersWithPayments(ids: string[]): Promise<Set<string>> {
    const [recorded, held] = await Promise.all([
      this.referencedIdsIn("collections", "received_by_user_id", ids),
      this.referencedIdsIn("collections", "held_by_user_id", ids),
    ]);
    return new Set([...recorded, ...held]);
  }

  async setActiveMany(ids: string[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbUser>(
        "users",
        id,
        { active, updated_at: nowIso() },
        { action: active ? "restore" : "update" },
      );
    }
  }

  async delete(id: string): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    await this.online.delete(id);
    await this.db.runAsync("DELETE FROM users WHERE id = ?", [id] as never[]);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.updatePassword(userId, newPassword);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.users, "users"),
    ]);
    return this.count(
      `SELECT COUNT(*) AS n FROM users ${where.sql}`,
      where.params,
    );
  }
}
