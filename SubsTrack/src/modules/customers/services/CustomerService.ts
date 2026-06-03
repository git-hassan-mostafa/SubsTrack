import type { Customer, Plan, TierPlan, TenantUsage } from "@/src/core/types";
import type { DbCustomer, DbPlan } from "@/src/core/types/db";
import { PAGE_SIZE, type BranchFilter } from "@/src/core/constants";
import { isValidDateString } from "@/src/core/utils/date";
import i18n from "@/src/core/i18n";
import { CustomerRepository } from "../repository/CustomerRepository";
import { tierService } from "@/src/modules/subscription/services/TierService";

type DbCustomerWithPlan = DbCustomer & { plans?: DbPlan | null };

function mapDbCustomerToCustomer(db: DbCustomerWithPlan): Customer {
  const plan: Plan | null = db.plans
    ? {
      id: db.plans.id,
      name: db.plans.name,
      price: db.plans.price != null ? Number(db.plans.price) : null,
      isCustomPrice: db.plans.is_custom_price,
      durationMonths: db.plans.duration_months,
      currencyId: db.plans.currency_id,
      branchId: db.plans.branch_id,
      tenantId: db.plans.tenant_id,
      createdAt: db.plans.created_at,
    }
    : null;

  return {
    id: db.id,
    name: db.name,
    phoneNumber: db.phone_number,
    address: db.address,
    area: db.area,
    notes: db.notes,
    active: db.active,
    isRegular: db.is_regular,
    planId: db.plan_id,
    branchId: db.branch_id,
    tenantId: db.tenant_id,
    startDate: db.start_date,
    cancelledAt: db.cancelled_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    plan,
  };
}

type CustomerInput = Pick<
  Customer,
  "name" | "phoneNumber" | "address" | "area" | "notes" | "planId" | "branchId" | "startDate" | "isRegular"
>;

export class CustomerService {
  private repository = new CustomerRepository();

  async getCustomers(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ customers: Customer[]; hasMore: boolean; totalCount: number }> {
    const [rows, totalCount] = await Promise.all([
      this.repository.findAll(page, searchQuery, branchFilter),
      this.repository.countAll(branchFilter),
    ]);
    return {
      customers: rows.map(mapDbCustomerToCustomer),
      hasMore: rows.length >= PAGE_SIZE,
      totalCount,
    };
  }

  async getCustomer(id: string): Promise<Customer> {
    const row = await this.repository.findById(id);
    return mapDbCustomerToCustomer(row);
  }

  async createCustomer(
    data: CustomerInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ): Promise<Customer> {
    this.validateInput(data);
    tierService.assertCanCreate(tier, usage, 'customers');
    const row = await this.repository.create({
      name: data.name.trim(),
      phone_number: data.phoneNumber?.trim() || null,
      address: data.address?.trim() || null,
      area: data.area?.trim() || null,
      notes: data.notes?.trim() || null,
      plan_id: data.planId,
      branch_id: data.branchId,
      tenant_id: tenantId,
      start_date: data.startDate,
      active: true,
      is_regular: data.isRegular,
      cancelled_at: null,
    });
    return mapDbCustomerToCustomer(row);
  }

  async updateCustomer(id: string, data: CustomerInput): Promise<Customer> {
    this.validateInput(data);
    const row = await this.repository.update(id, {
      name: data.name.trim(),
      phone_number: data.phoneNumber?.trim() || null,
      address: data.address?.trim() || null,
      area: data.area?.trim() || null,
      notes: data.notes?.trim() || null,
      plan_id: data.planId,
      branch_id: data.branchId,
      start_date: data.startDate,
      is_regular: data.isRegular,
    });
    return mapDbCustomerToCustomer(row);
  }

  async deactivateCustomer(id: string): Promise<Customer> {
    const row = await this.repository.deactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  async deleteCustomer(id: string): Promise<{ mode: 'hard' } | { mode: 'soft'; customer: Customer }> {
    const paymentCount = await this.repository.countPayments(id);
    if (paymentCount === 0) {
      await this.repository.delete(id);
      return { mode: 'hard' };
    }
    const row = await this.repository.deactivate(id);
    return { mode: 'soft', customer: mapDbCustomerToCustomer(row) };
  }

  async reactivateCustomer(id: string): Promise<Customer> {
    const row = await this.repository.reactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  private validateInput(data: CustomerInput): void {
    if (!data.name.trim()) throw new Error(i18n.t("errors.customer_name_required"));
    if (!data.startDate) throw new Error(i18n.t("errors.start_date_required"));
    if (!isValidDateString(data.startDate))
      throw new Error(i18n.t("errors.start_date_format"));
    if (!data.branchId) {
      throw new Error(i18n.t("errors.customer_needs_branch"));
    }
  }
}
