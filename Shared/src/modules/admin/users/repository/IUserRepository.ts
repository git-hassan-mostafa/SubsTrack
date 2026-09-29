import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbUser } from "@shared/core/types/db";
import type { StaffRole, UserPageQuery } from "@shared/modules/admin/users/utils/types";

export interface CreateUserPayload {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: StaffRole;
  tenantId: string;
  branchId: string | null;
}

// create / delete / updatePassword run edge functions and are online-only.
export interface IUserRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbUser[]>;
  findPage(query: UserPageQuery): Promise<Page<DbUser>>;
  create(payload: CreateUserPayload): Promise<DbUser>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbUser,
        "username" | "full_name" | "phone_number" | "role" | "branch_id"
      >
    >,
  ): Promise<DbUser>;
  setActive(id: string, active: boolean): Promise<DbUser>;
  countPayments(id: string): Promise<number>;
  usersWithPayments(ids: string[]): Promise<Set<string>>;
  setActiveMany(ids: string[], active: boolean): Promise<void>;
  delete(id: string): Promise<void>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
}
