import { repositories } from "@shared/core/runtime/repositories";
import i18n from "@shared/core/i18n";
import {
  type CreateTenantInput,
  type CreateTenantResult,
} from "@shared/modules/authentication/signup/utils/types";
import {
  isLongEnoughPassword,
  isValidUsername,
} from "@shared/modules/admin/users/utils/userRules";

interface OrganizationForm {
  name: string;
  tenantCode: string;
}

interface AccountForm {
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  confirmPassword: string;
}

const TENANT_CODE_REGEX = /^[a-z0-9]+$/;
const RESERVED_TENANT_CODES = new Set(["usd", "www", "admin", "api"]);

class SignupService {
  validateOrganization(form: OrganizationForm): void {
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
    if (!isValidUsername(username)) {
      throw new Error(i18n.t("errors.username_invalid_chars"));
    }
    if (!fullName) throw new Error(i18n.t("errors.fullname_required"));
    if (!isLongEnoughPassword(form.adminPassword)) {
      throw new Error(i18n.t("errors.password_too_short"));
    }
    if (form.adminPassword !== form.confirmPassword) {
      throw new Error(i18n.t("users.password_mismatch"));
    }
  }

  async checkTenantCodeAvailable(code: string): Promise<boolean> {
    return repositories().signup.isTenantCodeAvailable(code);
  }

  async createTenant(
    organization: OrganizationForm,
    account: AccountForm,
  ): Promise<CreateTenantResult> {
    this.validateOrganization(organization);
    this.validateAccount(account);

    const input: CreateTenantInput = {
      name: organization.name.trim(),
      tenantCode: organization.tenantCode.trim().toLowerCase(),
      adminUserName: account.adminUserName.trim().toLowerCase(),
      adminFullName: account.adminFullName.trim(),
      adminPassword: account.adminPassword,
    };
    return repositories().signup.createTenant(input);
  }
}

export default new SignupService();
