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
    await this.ensureFreshSession();
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
    const [recorded, held] = await Promise.all([
      this.db.from('collections').select('id', { count: 'exact', head: true })
        .eq('received_by_user_id', id),
      this.db.from('collections').select('id', { count: 'exact', head: true })
        .eq('held_by_user_id', id),
    ]);
    if (recorded.error) this.handleError(recorded.error);
    if (held.error) this.handleError(held.error);
    return (recorded.count ?? 0) + (held.count ?? 0);
  }

  async usersWithPayments(ids: string[]): Promise<Set<string>> {
    const [recorded, held] = await Promise.all([
      this.referencedIdsIn('collections', 'received_by_user_id', ids),
      this.referencedIdsIn('collections', 'held_by_user_id', ids),
    ]);
    return new Set([...recorded, ...held]);
  }

  async setActiveMany(ids: string[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbUser>('users', id, { active }, {
        action: active ? 'restore' : 'update',
      });
    }
  }

  async delete(id: string): Promise<void> {
    const { data: prior } = await this.db.from('users').select('*').eq('id', id).maybeSingle();
    await this.ensureFreshSession();
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
    await this.ensureFreshSession();
    const { error } = await this.db.functions.invoke('update-user-password', {
      body: { userId, newPassword },
    });
    if (error) await this.handleFunctionsError(error);
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

const impl: IUserRepository =
  Platform.OS === "web" ? new UserRepository() : new OfflineUserRepository();

export default impl;
