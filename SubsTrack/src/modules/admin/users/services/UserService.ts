import { repositories } from "@shared/core/runtime/repositories";
import type { AppUser, UserRole } from "@shared/core/types";
import type { BranchFilter } from "@shared/core/constants";
import i18n from "@shared/core/i18n";
import { mapDbUserToAppUser } from "@shared/modules/admin/users/utils/mapper";

interface CreateUserInput {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: "admin" | "user";
  branchId: string | null;
}

interface UpdateUserInput {
  username: string;
  fullName: string;
  phone: string | null;
  role: "admin" | "user";
  branchId: string | null;
  newPassword?: string;
}

class UserService {
  async getUsers(branchFilter: BranchFilter = null): Promise<AppUser[]> {
    const rows = await repositories().user.findAll(branchFilter);
    return rows.map(mapDbUserToAppUser);
  }

  private validateUsername(username: string): void {
    if (!username.trim()) throw new Error(i18n.t("errors.username_required"));
    if (!/^[a-zA-Z0-9._]+$/.test(username.trim())) {
      throw new Error(i18n.t("errors.username_invalid_chars"));
    }
  }

  async createUser(
    data: CreateUserInput,
    tenantId: string,
    tenantHasBranches: boolean,
  ): Promise<AppUser> {
    this.validateUsername(data.username);
    if (!data.fullName.trim())
      throw new Error(i18n.t("errors.fullname_required"));
    if (data.password.length < 8)
      throw new Error(i18n.t("errors.password_too_short"));
    if (!["admin", "user"].includes(data.role))
      throw new Error(i18n.t("errors.role_invalid"));
    this.validateBranchAssignment(data.role, data.branchId, tenantHasBranches);

    try {
      const row = await repositories().user.create({
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
    if (!data.fullName.trim())
      throw new Error(i18n.t("errors.fullname_required"));
    if (id === currentUserId && data.role !== currentUserRole) {
      throw new Error(i18n.t("errors.cannot_change_own_role"));
    }
    if (data.newPassword !== undefined && data.newPassword.length < 8) {
      throw new Error(i18n.t("errors.password_too_short"));
    }
    this.validateBranchAssignment(data.role, data.branchId, tenantHasBranches);
    try {
      const [row] = await Promise.all([
        repositories().user.update(id, {
          username: data.username.trim().toLowerCase(),
          full_name: data.fullName.trim(),
          phone_number: data.phone?.trim() || null,
          role: data.role,
          branch_id: data.branchId,
        }),
        data.newPassword
          ? repositories().user.updatePassword(id, data.newPassword)
          : Promise.resolve(),
      ]);
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  private validateBranchAssignment(
    role: "admin" | "user",
    branchId: string | null,
    tenantHasBranches: boolean,
  ): void {
    if (!tenantHasBranches) return;
    if (role === "user" && !branchId) {
      throw new Error(i18n.t("errors.staff_needs_branch"));
    }
  }

  async deleteUser(
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ): Promise<{ mode: "hard" } | { mode: "soft"; user: AppUser }> {
    this.checkToggleActivePermission(id, callerId, callerRole, targetRole);
    const paymentCount = await repositories().user.countPayments(id);
    if (paymentCount === 0) {
      try {
        await repositories().user.delete(id);
      } catch (err) {
        this.rethrow(err);
      }
      return { mode: "hard" };
    }
    try {
      const row = await repositories().user.setActive(id, false);
      return { mode: "soft", user: mapDbUserToAppUser(row) };
    } catch (err) {
      this.rethrow(err);
    }
  }

  async deleteUsers(
    targets: { id: string; role: UserRole }[],
    callerId: string,
    callerRole: UserRole,
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (targets.length === 0) return { hard: [], soft: [] };
    for (const t of targets) {
      this.checkToggleActivePermission(t.id, callerId, callerRole, t.role);
    }
    const ids = targets.map((t) => t.id);
    const withPayments = await repositories().user.usersWithPayments(ids);
    const soft = ids.filter((id) => withPayments.has(id));
    const hard = ids.filter((id) => !withPayments.has(id));
    try {
      await Promise.all([
        repositories().user.setActiveMany(soft, false),
        ...hard.map((id) => repositories().user.delete(id)),
      ]);
    } catch (err) {
      this.rethrow(err);
    }
    return { hard, soft };
  }

  async deactivateUser(
    id: string,
    callerId: string,
    callerRole: UserRole,
    targetRole: UserRole,
  ): Promise<AppUser> {
    this.checkToggleActivePermission(id, callerId, callerRole, targetRole);
    try {
      const row = await repositories().user.setActive(id, false);
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
      const row = await repositories().user.setActive(id, true);
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
    if (callerRole === "user") {
      throw new Error(i18n.t("errors.forbidden"));
    }
    if (callerRole === "admin" && targetRole !== "user") {
      throw new Error(i18n.t("errors.admin_can_only_toggle_staff"));
    }
    if (callerRole === "superadmin" && targetId === callerId) {
      throw new Error(i18n.t("errors.cannot_deactivate_self"));
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("uq_users_username_tenant") || msg.includes("duplicate")) {
      throw new Error(i18n.t("errors.username_exists"));
    }
    throw err instanceof Error
      ? err
      : new Error(i18n.t("errors.connection_error"));
  }
}

export default new UserService();
