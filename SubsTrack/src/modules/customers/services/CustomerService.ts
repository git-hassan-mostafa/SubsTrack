import type { Customer, Plan } from "@/src/core/types";
import type { DbCustomer, DbPlan } from "@/src/core/types/db";
import { PAGE_SIZE } from "@/src/core/constants";
import { isValidDateString } from "@/src/core/utils/date";
import { CustomerRepository } from "../repository/CustomerRepository";

type DbCustomerWithPlan = DbCustomer & { plans?: DbPlan | null };

function mapDbCustomerToCustomer(db: DbCustomerWithPlan): Customer {
  const plan: Plan | null = db.plans
    ? {
      id: db.plans.id,
      name: db.plans.name,
      price: db.plans.price,
      isCustomPrice: db.plans.is_custom_price,
      tenantId: db.plans.tenant_id,
      createdAt: db.plans.created_at,
    }
    : null;

  return {
    id: db.id,
    name: db.name,
    phoneNumber: db.phone_number,
    address: db.address,
    active: db.active,
    planId: db.plan_id,
    tenantId: db.tenant_id,
    startDate: db.start_date,
    cancelledAt: db.cancelled_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    plan,
  };
}

type CreateCustomerInput = Pick<
  Customer,
  'name' | 'phoneNumber' | 'address' | 'planId' | 'startDate'
>;

export class CustomerService {
  private repository = new CustomerRepository();

  async getCustomers(
    page: number,
    searchQuery?: string,
  ): Promise<{ customers: Customer[]; hasMore: boolean }> {
    const rows = await this.repository.findAll(page, searchQuery);
    return {
      customers: rows.map(mapDbCustomerToCustomer),
      hasMore: rows.length >= PAGE_SIZE,
    };
  }

  async getCustomer(id: string): Promise<Customer> {
    const row = await this.repository.findById(id);
    return mapDbCustomerToCustomer(row);
  }

  async createCustomer(
    data: CreateCustomerInput,
    tenantId: string,
  ): Promise<Customer> {
    this.validateInput(data);
    const row = await this.repository.create({
      name: data.name.trim(),
      phone_number: data.phoneNumber?.trim() || null,
      address: data.address?.trim() || null,
      plan_id: data.planId,
      tenant_id: tenantId,
      start_date: data.startDate,
      active: true,
      cancelled_at: null,
    });
    return mapDbCustomerToCustomer(row);
  }

  async updateCustomer(
    id: string,
    data: Omit<CreateCustomerInput, "startDate">,
  ): Promise<Customer> {
    if (!data.name.trim()) throw new Error("Customer name is required");
    const row = await this.repository.update(id, {
      name: data.name.trim(),
      phone_number: data.phoneNumber?.trim() || null,
      address: data.address?.trim() || null,
      plan_id: data.planId,
    });
    return mapDbCustomerToCustomer(row);
  }

  async deactivateCustomer(id: string): Promise<Customer> {
    const row = await this.repository.deactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  async reactivateCustomer(id: string): Promise<Customer> {
    const row = await this.repository.reactivate(id);
    return mapDbCustomerToCustomer(row);
  }

  private validateInput(data: CreateCustomerInput): void {
    if (!data.name.trim()) throw new Error("Customer name is required");
    if (!data.startDate) throw new Error("Start date is required");
    if (!isValidDateString(data.startDate))
      throw new Error("Start date must be in YYYY-MM-DD HH:mm format");
  }
}
