import type { AppUser, UserRole, TierPlan, TenantUsage } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import type { DbUser } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { UserRepository } from '../repository/UserRepository';
import { tierService } from '@/src/modules/subscription/services/TierService';

function mapDbUserToAppUser(db: DbUser): AppUser {
  return {
    id: db.id,
    username: db.username,
    fullName: db.full_name,
    phoneNumber: db.phone_number,
    role: db.role,
    active: db.active,
    tenantId: db.tenant_id,
    branchId: db.branch_id,
    createdAt: db.created_at,
  };
}

interface CreateUserInput {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: 'admin' | 'user';
  branchId: string | null;
}

interface UpdateUserInput {
  username: string;
  fullName: string;
  phone: string | null;
  role: 'admin' | 'user';
  branchId: string | null;
}

export class UserService {
  private repository = new UserRepository();

  async getUsers(branchFilter: BranchFilter = null): Promise<AppUser[]> {
    const rows = await this.repository.findAll(branchFilter);
    return rows.map(mapDbUserToAppUser);
  }

  private validateUsername(username: string): void {
    if (!username.trim()) throw new Error(i18n.t('errors.username_required'));
    if (!/^[a-zA-Z0-9._]+$/.test(username.trim())) {
      throw new Error(i18n.t('errors.username_invalid_chars'));
    }
  }

  async createUser(
    data: CreateUserInput,
    tenantId: string,
    tenantHasBranches: boolean,
    tier: TierPlan,
    usage: TenantUsage,
  ): Promise<AppUser> {
    this.validateUsername(data.username);
    if (!data.fullName.trim()) throw new Error(i18n.t('errors.fullname_required'));
    if (data.password.length < 8) throw new Error(i18n.t('errors.password_too_short'));
    if (!['admin', 'user'].includes(data.role)) throw new Error(i18n.t('errors.role_invalid'));
    this.validateBranchAssignment(data.role, data.branchId, tenantHasBranches);
    tierService.assertCanCreate(tier, usage, 'users');

    try {
      const row = await this.repository.create({
        username: data.username.trim().toLowerCase(),
        fullName: data.fullName.trim(),
        password: data.password,
        phone: data.phone?.trim() || null,
        role: data.role,
        tenantId,
        branchId: data.branchId,
      });
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  async updateUser(
    id: string,
    currentUserId: string,
    currentUserRole: string,
    data: UpdateUserInput,
    tenantHasBranches: boolean,
  ): Promise<AppUser> {
    this.validateUsername(data.username);
    if (!data.fullName.trim()) throw new Error(i18n.t('errors.fullname_required'));
    if (id === currentUserId && data.role !== currentUserRole) {
      throw new Error(i18n.t('errors.cannot_change_own_role'));
    }
    this.validateBranchAssignment(data.role, data.branchId, tenantHasBranches);
    try {
      const row = await this.repository.update(id, {
        username: data.username.trim().toLowerCase(),
        full_name: data.fullName.trim(),
        phone_number: data.phone?.trim() || null,
        role: data.role,
        branch_id: data.branchId,
      });
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  // Once a tenant has at least one branch, the 'user' role MUST be assigned
  // to a branch. Admins can stay branch-less (tenant-wide).
  private validateBranchAssignment(
    role: 'admin' | 'user',
    branchId: string | null,
    tenantHasBranches: boolean,
  ): void {
    if (!tenantHasBranches) return;
    if (role === 'user' && !branchId) {
      throw new Error(i18n.t('errors.staff_needs_branch'));
    }
  }

  async deleteUser(
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ): Promise<{ mode: 'hard' } | { mode: 'soft'; user: AppUser }> {
    this.checkToggleActivePermission(id, callerId, callerRole, targetRole);
    const paymentCount = await this.repository.countPayments(id);
    if (paymentCount === 0) {
      try {
        await this.repository.delete(id);
      } catch (err) {
        this.rethrow(err);
      }
      return { mode: 'hard' };
    }
    try {
      const row = await this.repository.setActive(id, false);
      return { mode: 'soft', user: mapDbUserToAppUser(row) };
    } catch (err) {
      this.rethrow(err);
    }
  }

  async deactivateUser(
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ): Promise<AppUser> {
    this.checkToggleActivePermission(id, callerId, callerRole, targetRole);
    try {
      const row = await this.repository.setActive(id, false);
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  async activateUser(
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ): Promise<AppUser> {
    this.checkToggleActivePermission(id, callerId, callerRole, targetRole);
    try {
      const row = await this.repository.setActive(id, true);
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  private checkToggleActivePermission(
    targetId: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ): void {
    if (callerRole === 'user') {
      throw new Error(i18n.t('errors.forbidden'));
    }
    if (callerRole === 'admin' && targetRole !== 'user') {
      throw new Error(i18n.t('errors.admin_can_only_toggle_staff'));
    }
    if (callerRole === 'superadmin' && targetId === callerId) {
      throw new Error(i18n.t('errors.cannot_deactivate_self'));
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_users_username_tenant') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.username_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}
