import type { BranchFilter } from '@/src/core/constants';
import type { DbUser } from '@/src/core/types/db';

export interface CreateUserPayload {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: 'admin' | 'user';
  tenantId: string;
  branchId: string | null;
}

/**
 * The User repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 * create / delete / updatePassword run edge functions and are online-only.
 */
export interface IUserRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbUser[]>;
  create(payload: CreateUserPayload): Promise<DbUser>;
  update(
    id: string,
    payload: Partial<Pick<DbUser, 'username' | 'full_name' | 'phone_number' | 'role' | 'branch_id'>>,
  ): Promise<DbUser>;
  setActive(id: string, active: boolean): Promise<DbUser>;
  countPayments(id: string): Promise<number>;
  usersWithPayments(ids: string[]): Promise<Set<string>>;
  setActiveMany(ids: string[], active: boolean): Promise<void>;
  delete(id: string): Promise<void>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
}
