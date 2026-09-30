import { repositories } from "@shared/core/runtime/repositories";
import type { Customer } from "@shared/core/types";
import { PAGE_SIZE, type BranchFilter } from "@shared/core/constants";
import i18n from "@shared/core/i18n";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";
import { getTodayDateString } from "@shared/core/utils/date";
import { mapDbCustomerToCustomer } from "@shared/modules/customer/customers/utils/mapper";
import type {
  CustomerStatusList,
  CustomerStatusRequest,
} from "@shared/modules/customer/customers/utils/types";

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
      repositories().customer.findAll(page, searchQuery, branchFilter),
      repositories().customer.countActive(branchFilter),
    ]);
    return {
      customers: rows.map(mapDbCustomerToCustomer),
      hasMore: rows.length >= PAGE_SIZE,
      activeCount,
    };
  }

  // One page of an exact tab, worked out on the server over every customer.
  async getCustomerStatusPage(
    query: Omit<CustomerStatusRequest, "today">,
  ): Promise<CustomerStatusList> {
    const page = await repositories().customerStatus.findPage({
      ...query,
      today: getTodayDateString(),
    });
    return {
      rows: page.rows.map((row) => ({
        customer: mapDbCustomerToCustomer(row.customer),
        status: row.status,
        debtUsd: row.debtUsd,
      })),
      total: page.total,
      counts: page.counts,
    };
  }

  async getCustomer(id: string): Promise<Customer> {
    const row = await repositories().customer.findById(id);
    return mapDbCustomerToCustomer(row);
  }

  // A null filter is tenant-wide, which is the scope the allowance caps.
  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    return repositories().customer.countActive(branchFilter);
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
    const row = await repositories().customer.create({
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
    const row = await repositories().customer.update(id, {
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
    const row = await repositories().customer.deactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  async deleteCustomer(
    id: string,
  ): Promise<{ mode: "hard" } | { mode: "soft"; customer: Customer }> {
    const paymentCount = await repositories().customer.countPayments(id);
    if (paymentCount === 0) {
      await repositories().customer.delete(id);
      return { mode: "hard" };
    }
    const row = await repositories().customer.deactivate(id);
    return { mode: "soft", customer: mapDbCustomerToCustomer(row) };
  }

  async reactivateCustomer(id: string): Promise<Customer> {
    const row = await repositories().customer.reactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  async deleteManyCustomers(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const withPayments = await repositories().customer.customersWithPayments(ids);
    const soft = ids.filter((id) => withPayments.has(id));
    const hard = ids.filter((id) => !withPayments.has(id));
    await Promise.all([
      repositories().customer.deactivateMany(soft),
      repositories().customer.deleteMany(hard),
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
