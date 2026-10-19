import { BaseRepository } from "@shared/core/utils/BaseRepository";
import { PAGE_SIZE, type BranchFilter } from "@shared/core/constants";
import type { DbCustomer } from "@shared/core/types/db";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type {
  CreateCustomerPayload,
  CustomerWithLines,
  ICustomerRepository,
} from "@shared/modules/customer/customers/repository/ICustomerRepository";
import { CUSTOMER_WITH_LINES_SELECT } from "@shared/modules/customer/customers/repository/customerSelect";

const SELECT = CUSTOMER_WITH_LINES_SELECT;

export class CustomerRepository
  extends BaseRepository
  implements ICustomerRepository
{
  async findAll(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const q = sanitizeSearchTerm(searchQuery);
    let query = this.db.from("customers").select(SELECT).order("name");
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.customers,
    );
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,phone_number.ilike.%${q}%,address.ilike.%${q}%,area.ilike.%${q}%`,
      );
    }
    const { data, error } = await query.range(from, to);
    if (error) this.handleError(error);
    return (data ?? []) as CustomerWithLines[];
  }

  findAllForStatus(
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    return this.readCustomers(branchFilter, true);
  }

  findEveryWithLines(
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    return this.readCustomers(branchFilter, false);
  }

  // Ageing and the customer report count every customer — gotcha #175.
  private async readCustomers(
    branchFilter: BranchFilter,
    activeRegularOnly: boolean,
  ): Promise<CustomerWithLines[]> {
    const rows = await this.readEveryRow<CustomerWithLines>((from, to) => {
      const all = this.db.from("customers").select(SELECT, { count: "exact" });
      const scoped = activeRegularOnly
        ? all.eq("active", true).eq("is_regular", true)
        : all;
      return this.applyBranchFilter(
        scoped,
        branchFilter,
        this.BRANCH_SCOPES.customers,
      )
        .order("id")
        .range(from, to);
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from("customers")
      .select(SELECT)
      .eq("id", id)
      .single();
    if (error) this.handleError(error);
    if (!data) throw new Error("Customer not found");
    return data as CustomerWithLines;
  }

  async create(payload: CreateCustomerPayload): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from("customers")
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    const created = data as CustomerWithLines;
    this.audit({
      table: "customers",
      recordId: created.id,
      action: "create",
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  private async patch(
    id: string,
    values: Record<string, unknown>,
    action: "update" | "restore",
  ): Promise<CustomerWithLines> {
    const { data: prior } = await this.db
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const { data, error } = await this.db
      .from("customers")
      .update(values)
      .eq("id", id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    const updated = data as CustomerWithLines;
    this.audit({
      table: "customers",
      recordId: id,
      action,
      before: prior,
      after: updated,
      branchId: updated.branch_id,
    });
    return updated;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomer,
        | "name"
        | "phone_number"
        | "address"
        | "area"
        | "notes"
        | "location_url"
        | "branch_id"
        | "is_regular"
      >
    >,
  ): Promise<CustomerWithLines> {
    return this.patch(id, payload, "update");
  }

  async deactivate(id: string): Promise<CustomerWithLines> {
    return this.patch(
      id,
      { active: false, cancelled_at: new Date().toISOString() },
      "update",
    );
  }

  async reactivate(id: string): Promise<CustomerWithLines> {
    return this.patch(id, { active: true, cancelled_at: null }, "restore");
  }

  async countPayments(id: string): Promise<number> {
    const [charges, collections] = await Promise.all([
      this.db
        .from("charges")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id),
      this.db
        .from("collections")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id),
    ]);
    if (charges.error) this.handleError(charges.error);
    if (collections.error) this.handleError(collections.error);
    return (charges.count ?? 0) + (collections.count ?? 0);
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { data: prior } = await this.db
      .from("customers")
      .select("*")
      .in("id", ids);
    const { error } = await this.db.from("customers").delete().in("id", ids);
    if (error) this.handleError(error);
    for (const c of (prior ?? []) as DbCustomer[]) {
      this.audit({
        table: "customers",
        recordId: c.id,
        action: "delete",
        before: c,
        branchId: c.branch_id,
      });
    }
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const cancelledAt = new Date().toISOString();
    const { error, data } = await this.db
      .from("customers")
      .update({ active: false, cancelled_at: cancelledAt })
      .in("id", ids)
      .select("*");
    if (error) this.handleError(error);
    for (const c of (data ?? []) as DbCustomer[]) {
      this.audit({
        table: "customers",
        recordId: c.id,
        action: "update",
        before: { ...c, active: true, cancelled_at: null },
        after: c,
        branchId: c.branch_id,
      });
    }
  }

  async customersWithPayments(ids: string[]): Promise<Set<string>> {
    const [charges, collections] = await Promise.all([
      this.referencedIdsIn("charges", "customer_id", ids),
      this.referencedIdsIn("collections", "customer_id", ids),
    ]);
    return new Set([...charges, ...collections]);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from("customers")
      .select("id", { count: "exact", head: true });
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.customers,
    );
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.customers,
    );
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countCreatedInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    let query = this.db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", endExclusive);
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.customers,
    );
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countCancelledInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    let query = this.db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("cancelled_at", start)
      .lt("cancelled_at", endExclusive);
    query = this.applyBranchFilter(
      query,
      branchFilter,
      this.BRANCH_SCOPES.customers,
    );
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }
}
