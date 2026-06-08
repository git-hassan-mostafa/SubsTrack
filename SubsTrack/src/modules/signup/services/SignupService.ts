import i18n from "@/src/core/i18n";
import repository, {
  type CreateTenantInput,
  type CreateTenantResult,
} from "../repository/SignupRepository";

export interface WorkspaceForm {
  name: string;
  tenantCode: string;
}

export interface AccountForm {
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  confirmPassword: string;
}

const TENANT_CODE_REGEX = /^[a-z0-9]+$/;
const USERNAME_REGEX = /^[a-z0-9._]+$/;
const RESERVED_TENANT_CODES = new Set(["usd", "www", "admin", "api"]);

class SignupService {
  validateWorkspace(form: WorkspaceForm): void {
    const name = form.name.trim();
    const code = form.tenantCode.trim().toLowerCase();
    if (!name) throw new Error(i18n.t("signup.errors.name_required"));
    if (!code) throw new Error(i18n.t("signup.errors.tenant_code_required"));
    if (code.length < 2 || code.length > 32) {
      throw new Error(i18n.t("signup.errors.tenant_code_length"));
    }
    if (!TENANT_CODE_REGEX.test(code)) {
      throw new Error(i18n.t("signup.errors.tenant_code_format"));
    }
    if (RESERVED_TENANT_CODES.has(code)) {
      throw new Error(i18n.t("signup.errors.tenant_code_reserved"));
    }
  }

  validateAccount(form: AccountForm): void {
    const username = form.adminUserName.trim().toLowerCase();
    const fullName = form.adminFullName.trim();
    if (!username) throw new Error(i18n.t("errors.username_required"));
    if (!USERNAME_REGEX.test(username)) {
      throw new Error(i18n.t("errors.username_invalid_chars"));
    }
    if (!fullName) throw new Error(i18n.t("errors.fullname_required"));
    if (form.adminPassword.length < 8) {
      throw new Error(i18n.t("errors.password_too_short"));
    }
    if (form.adminPassword !== form.confirmPassword) {
      throw new Error(i18n.t("users.password_mismatch"));
    }
  }

  async checkTenantCodeAvailable(code: string): Promise<boolean> {
    return repository.isTenantCodeAvailable(code);
  }

  async createTenant(
    workspace: WorkspaceForm,
    account: AccountForm,
  ): Promise<CreateTenantResult> {
    this.validateWorkspace(workspace);
    this.validateAccount(account);

    const input: CreateTenantInput = {
      name: workspace.name.trim(),
      tenantCode: workspace.tenantCode.trim().toLowerCase(),
      adminUserName: account.adminUserName.trim().toLowerCase(),
      adminFullName: account.adminFullName.trim(),
      adminPassword: account.adminPassword,
    };
    return repository.createTenant(input);
  }
}

export default new SignupService()
