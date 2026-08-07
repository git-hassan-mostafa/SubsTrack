import { Platform } from "react-native";
import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { BranchFilter } from "@/src/core/constants";
import type { DbUser } from "@/src/core/types/db";
import type { CreateUserPayload, IUserRepository } from "./IUserRepository";
import { OfflineUserRepository } from "./UserRepository.offline";

export class UserRepository extends BaseRepository implements IUserRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbUser[]> {
    let query = this.db
      .from("users")
      .select("*")
      .order("username");
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.users);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbUser[];
  }

  async create(payload: CreateUserPayload): Promise<DbUser> {
    const { data, error } = await this.db.functions.invoke("create-user", {
      body: payload,
    });
    if (error) await this.handleFunctionsError(error);
    const created = data as DbUser;
    this.audit({
      table: "users",
      recordId: created.id,
      action: "create",
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbUser, "username" | "full_name" | "phone_number" | "role" | "branch_id">>,
  ): Promise<DbUser> {
    return this.auditedUpdate<DbUser>("users", id, payload);
  }

  async setActive(id: string, active: boolean): Promise<DbUser> {
    return this.auditedUpdate<DbUser>("users", id, { active }, {
      action: active ? "restore" : "update",
    });
  }

  async countPayments(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('received_by_user_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  // The subset of the given users who have recorded payments — one query.
  // Drives the soft-delete vs hard-delete split in bulk delete.
  async usersWithPayments(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('payments', 'received_by_user_id', ids);
  }

  // Soft-delete many users in one statement.
  async setActiveMany(ids: string[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbUser>('users', id, { active }, {
        action: active ? 'restore' : 'update',
      });
    }
  }

  async delete(id: string): Promise<void> {
    // Snapshot before the edge function removes the row.
    const { data: prior } = await this.db.from('users').select('*').eq('id', id).maybeSingle();
    const { error } = await this.db.functions.invoke('delete-user', {
      body: { userId: id },
    });
    if (error) await this.handleFunctionsError(error);
    const removed = prior as DbUser | null;
    if (removed) {
      this.audit({
        table: 'users',
        recordId: id,
        action: 'delete',
        before: removed,
        branchId: removed.branch_id,
      });
    }
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const { error } = await this.db.functions.invoke('update-user-password', {
      body: { userId, newPassword },
    });
    if (error) await this.handleFunctionsError(error);
    // The password itself is never recorded — only that it was changed.
    this.audit({
      table: 'users',
      recordId: userId,
      action: 'update',
      before: { password: '***' },
      after: { password: '***changed***' },
    });
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from("users")
      .select("id", { count: "exact", head: true });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.users);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }
}

// Platform seam: web talks to Supabase directly (unchanged); native uses the
// offline SQLite repository. Services import this default, so neither services
// nor slices change. The offline class is only constructed on native, so web
// never opens a local DB.
const impl: IUserRepository =
  Platform.OS === "web" ? new UserRepository() : new OfflineUserRepository();

export default impl;
