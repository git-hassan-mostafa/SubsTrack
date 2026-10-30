import { MIN_CUSTOMER_ALLOWANCE } from "@shared/modules/admin/billing/utils/types";
import { AppError } from "../../../core/errors.js";
import { TenantRepository } from "../repository/TenantRepository.js";

const DEFAULT_LIRA_RATE = 89000;
export const MIN_PASSWORD_LENGTH = 8;
const TENANT_CODE = /^[a-z0-9]+$/;

// Mirrors the tenants CHECKs: allowance floor, line floor, fixed price set.
function validateBilling(input) {
  if (!Number.isInteger(input.allowance) || input.allowance < MIN_CUSTOMER_ALLOWANCE) {
    throw new AppError(`Customer allowance must be a whole number of ${MIN_CUSTOMER_ALLOWANCE} or more`);
  }
  if (!Number.isInteger(input.planAllowance) || input.planAllowance < input.allowance) {
    throw new AppError("Service line allowance must be a whole number and at least the customer allowance");
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new AppError("Price per service line must be 0 or more");
  }
  const fixed = input.fixedPriceUsd;
  if (input.pricingModel !== "per_line" && (fixed == null || !Number.isFinite(fixed) || fixed < 0)) {
    throw new AppError("A package or unlimited plan needs a monthly price of 0 or more");
  }
}

function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

// null = missing or bad LiraRate; the caller falls back so signup never blocks.
function liraRateOf(raw) {
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

// No real email: username@tenantcode.com is the login id — gotcha #4.
function ownerEmail(username, tenantCode) {
  return `${username.trim().toLowerCase()}@${tenantCode}.com`;
}

export class TenantService {
  #repository = new TenantRepository();

  async getTenants() {
    const [tenants, requests] = await Promise.all([
      this.#repository.findAll(),
      this.#repository.findPendingRequests(),
    ]);
    const byTenant = new Map(requests.map((r) => [r.tenantId, r]));
    return tenants.map((t) => ({ ...t, pendingRequest: byTenant.get(t.id) ?? null }));
  }

  getTenantCounts(tenantId) {
    return this.#repository.countRows(tenantId);
  }

  getOwners(tenantId) {
    return this.#repository.findOwners(tenantId);
  }

  async resetOwnerPassword(userId, password) {
    validatePassword(password);
    await this.#repository.setPassword(userId, password);
  }

  // Order + rollback as in the Expo app (#30): tenant, branch, LBP, login, owner.
  async createTenant(data) {
    const tenantCode = data.tenantCode.toLowerCase().trim();
    if (!data.name.trim()) throw new AppError("Tenant name is required");
    if (!tenantCode) throw new AppError("Tenant code is required");
    if (!TENANT_CODE.test(tenantCode)) {
      throw new AppError("Tenant code may only contain letters and numbers");
    }
    if (!data.adminUserName.trim()) throw new AppError("Owner username is required");
    if (!data.adminFullName.trim()) throw new AppError("Owner full name is required");
    validatePassword(data.adminPassword);
    validateBilling({
      allowance: data.customerAllowance ?? MIN_CUSTOMER_ALLOWANCE,
      planAllowance: data.planAllowance ?? MIN_CUSTOMER_ALLOWANCE,
      price: data.pricePerPlanUsd ?? 0,
      pricingModel: data.pricingModel ?? "per_line",
      fixedPriceUsd: data.fixedPriceUsd ?? null,
    });

    const tenant = await this.#repository.create({
      name: data.name.trim(),
      tenantCode,
      customerAllowance: data.customerAllowance,
      planAllowance: data.planAllowance,
      pricePerPlanUsd: data.pricePerPlanUsd,
      pricingModel: data.pricingModel,
      fixedPriceUsd: data.fixedPriceUsd,
    });
    const rollbackTenant = () => this.#repository.delete(tenant.id).catch(() => null);

    try {
      await this.#repository.createDefaultBranch(tenant.id);
      const liraRate = liraRateOf(await this.#repository.findLiraRateValue()) ?? DEFAULT_LIRA_RATE;
      await this.#repository.createLbpCurrency(tenant.id, liraRate);
    } catch (e) {
      await rollbackTenant();
      throw e;
    }

    let ownerId;
    try {
      ownerId = await this.#repository.createOwnerLogin(
        ownerEmail(data.adminUserName, tenant.tenantCode),
        data.adminPassword,
      );
    } catch (e) {
      await rollbackTenant();
      throw e;
    }

    try {
      await this.#repository.insertOwner({
        id: ownerId,
        username: data.adminUserName.trim(),
        fullName: data.adminFullName.trim(),
        tenantId: tenant.id,
      });
    } catch (e) {
      await this.#repository.deleteOwnerLogin(ownerId).catch(() => null);
      await rollbackTenant();
      throw e;
    }

    return { ...tenant, pendingRequest: null };
  }

  async updateTenant(id, data, pendingRequest) {
    if (!data.name.trim()) throw new AppError("Tenant name is required");
    validateBilling({
      allowance: data.customerAllowance,
      planAllowance: data.planAllowance,
      price: data.pricePerPlanUsd,
      pricingModel: data.pricingModel,
      fixedPriceUsd: data.fixedPriceUsd,
    });
    const tenant = await this.#repository.update(id, {
      name: data.name.trim(),
      active: data.active,
      customerAllowance: data.customerAllowance,
      planAllowance: data.planAllowance,
      pricePerPlanUsd: data.pricePerPlanUsd,
      pricingModel: data.pricingModel,
      fixedPriceUsd: data.pricingModel === "per_line" ? null : data.fixedPriceUsd,
      whatsappEnabled: data.whatsappEnabled,
    });
    return { ...tenant, pendingRequest };
  }

  // Lines follow customers up, exactly as the RPC does, so the row can be patched.
  async acceptRequest(requestId, granted, current) {
    const whole =
      Number.isInteger(granted.customers) &&
      Number.isInteger(granted.plans) &&
      granted.customers >= 0 &&
      granted.plans >= 0;
    if (!whole || granted.customers + granted.plans < 1) {
      throw new AppError("Grant a whole number of 1 or more in total");
    }
    const request = await this.#repository.acceptRequest(requestId, granted);
    const customers = current.customers + granted.customers;
    return {
      request,
      customers,
      plans: Math.max(current.plans + granted.plans, customers),
    };
  }

  declineRequest(requestId) {
    return this.#repository.declineRequest(requestId);
  }
}
