import type { Customer } from "@/src/core/types";
import { PAGE_SIZE, type BranchFilter } from "@/src/core/constants";
import i18n from "@/src/core/i18n";
import repository from "../repository/CustomerRepository";
import billingService from "@/src/modules/admin/billing/services/BillingService";
import type { QuotaPair } from "@/src/modules/admin/billing/utils/types";
import { mapDbCustomerToCustomer } from "../utils/mapper";

export type CustomerInput = Pick<
  Customer,
  | "name"
  | "phoneNumber"
  | "address"
  | "area"
  | "notes"
  | "locationUrl"
  | "branchId"
  | "isRegular"
  | "portalPassword"
  | "portalEnabled"
>;

// Short because staff read it out over the phone to the customer.
export const MIN_PORTAL_PASSWORD_LENGTH = 4;

class CustomerService {
  async getCustomers(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ customers: Customer[]; hasMore: boolean; activeCount: number }> {
    const [rows, activeCount] = await Promise.all([
      repository.findAll(page, searchQuery, branchFilter),
      repository.countActive(branchFilter),
    ]);
    return {
      customers: rows.map(mapDbCustomerToCustomer),
      hasMore: rows.length >= PAGE_SIZE,
      activeCount,
    };
  }

  async getCustomer(id: string): Promise<Customer> {
    const row = await repository.findById(id);
    return mapDbCustomerToCustomer(row);
  }

  // A null filter is tenant-wide, which is the scope the allowance caps.
  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    return repository.countActive(branchFilter);
  }

  // The service lines drafted alongside the customer are counted BEFORE the
  // first write, or a refused line would leave an empty customer holding a seat.
  async createCustomer(
    data: CustomerInput,
    tenantId: string,
    limits: QuotaPair,
    active: QuotaPair,
    addingLines: number,
  ): Promise<Customer> {
    this.validateInput(data);
    billingService.assertQuotas(limits, active, {
      customers: active.customers + 1,
      plans: active.plans + addingLines,
    });
    const row = await repository.create({
      name: data.name.trim(),
      phone_number: data.phoneNumber?.trim() || null,
      address: data.address?.trim() || null,
      area: data.area?.trim() || null,
      notes: data.notes?.trim() || null,
      location_url: data.locationUrl?.trim() || null,
      branch_id: data.branchId,
      tenant_id: tenantId,
      active: true,
      is_regular: data.isRegular,
      cancelled_at: null,
      portal_password: portalPasswordOf(data),
      portal_enabled: data.portalEnabled,
    });
    return mapDbCustomerToCustomer(row);
  }

  async updateCustomer(id: string, data: CustomerInput): Promise<Customer> {
    this.validateInput(data);
    const row = await repository.update(id, {
      name: data.name.trim(),
      phone_number: data.phoneNumber?.trim() || null,
      address: data.address?.trim() || null,
      area: data.area?.trim() || null,
      notes: data.notes?.trim() || null,
      location_url: data.locationUrl?.trim() || null,
      branch_id: data.branchId,
      is_regular: data.isRegular,
      portal_password: portalPasswordOf(data),
      portal_enabled: data.portalEnabled,
    });
    return mapDbCustomerToCustomer(row);
  }

  async deactivateCustomer(id: string): Promise<Customer> {
    const row = await repository.deactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  async deleteCustomer(
    id: string,
  ): Promise<{ mode: "hard" } | { mode: "soft"; customer: Customer }> {
    const paymentCount = await repository.countPayments(id);
    if (paymentCount === 0) {
      await repository.delete(id);
      return { mode: "hard" };
    }
    const row = await repository.deactivate(id);
    return { mode: "soft", customer: mapDbCustomerToCustomer(row) };
  }

  async reactivateCustomer(id: string): Promise<Customer> {
    const row = await repository.reactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  async deleteManyCustomers(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const withPayments = await repository.customersWithPayments(ids);
    const soft = ids.filter((id) => withPayments.has(id));
    const hard = ids.filter((id) => !withPayments.has(id));
    await Promise.all([
      repository.deactivateMany(soft),
      repository.deleteMany(hard),
    ]);
    return { hard, soft };
  }

  private validateInput(data: CustomerInput): void {
    if (!data.name.trim())
      throw new Error(i18n.t("errors.customer_name_required"));
    if (!data.branchId) {
      throw new Error(i18n.t("errors.customer_needs_branch"));
    }
    if (
      data.portalEnabled &&
      (data.portalPassword ?? "").trim().length < MIN_PORTAL_PASSWORD_LENGTH
    ) {
      throw new Error(
        i18n.t("errors.portal_password_too_short", {
          count: MIN_PORTAL_PASSWORD_LENGTH,
        }),
      );
    }
  }
}

// Switching the portal off CLEARS the password — a stale one is unguarded.
function portalPasswordOf(data: CustomerInput): string | null {
  if (!data.portalEnabled) return null;
  return data.portalPassword?.trim() || null;
}

export default new CustomerService();
