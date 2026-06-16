import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { BranchFilter } from "@/src/core/constants";
import type { DbUser } from "@/src/core/types/db";

interface CreateUserPayload {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: "admin" | "user";
  tenantId: string;
  branchId: string | null;
}

class UserRepository extends BaseRepository {
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
    return data as DbUser;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbUser, "username" | "full_name" | "phone_number" | "role" | "branch_id">>,
  ): Promise<DbUser> {
    const { data, error } = await this.db
      .from("users")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbUser;
  }

  async setActive(id: string, active: boolean): Promise<DbUser> {
    const { data, error } = await this.db
      .from("users")
      .update({ active })
      .eq("id", id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbUser;
  }

  async countPayments(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('received_by_user_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.functions.invoke('delete-user', {
      body: { userId: id },
    });
    if (error) await this.handleFunctionsError(error);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const { error } = await this.db.functions.invoke('update-user-password', {
      body: { userId, newPassword },
    });
    if (error) await this.handleFunctionsError(error);
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

export default new UserRepository()
