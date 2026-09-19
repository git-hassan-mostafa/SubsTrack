import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbCustomerRequest, DbTenant } from "@/src/core/types/db";

// What the owner actually grants, per limit — either half may be 0.
export interface GrantedCounts {
  customers: number;
  plans: number;
}

// Billing columns are optional on insert so a new tenant can take the schema
// defaults rather than the app restating them.
export type CreateTenantPayload = Pick<DbTenant, "name" | "tenant_code"> &
  Partial<
    Pick<
      DbTenant,
      "customer_allowance" | "plan_allowance" | "price_per_plan_usd"
    >
  >;

// true = the table carries an active flag; plans is the only one without.
export const COUNTED_TABLES = {
  users: true,
  branches: true,
  customers: true,
  customer_plans: true,
  plans: false,
  products: true,
  services: true,
  currencies: true,
} as const;

export type CountedTable = keyof typeof COUNTED_TABLES;

// active stays null for a table with no active flag.
export interface TableCount {
  total: number;
  active: number | null;
}

export class TenantRepository extends BaseRepository {
  async findAll(): Promise<DbTenant[]> {
    const { data, error } = await this.db
      .from("tenants")
      .select("*")
      .order("name");
    if (error) this.handleError(error);
    return (data ?? []) as DbTenant[];
  }

  // One query for the whole list; the service zips them onto their tenants.
  // An embed would drag every historical request along with them.
  async findPendingRequests(): Promise<DbCustomerRequest[]> {
    const { data, error } = await this.db
      .from("customer_requests")
      .select("*")
      .eq("status", "pending");
    if (error) this.handleError(error);
    return (data ?? []) as DbCustomerRequest[];
  }

  // HEAD counts, so a tenant holding thousands of rows still costs one number.
  async countRows(tenantId: string): Promise<Record<CountedTable, TableCount>> {
    const tables = Object.keys(COUNTED_TABLES) as CountedTable[];
    const entries = await Promise.all(
      tables.map(async (table) => {
        const [total, active] = await Promise.all([
          this.countTable(table, tenantId, false),
          COUNTED_TABLES[table]
            ? this.countTable(table, tenantId, true)
            : Promise.resolve(null),
        ]);
        return [table, { total, active }] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<CountedTable, TableCount>;
  }

  private async countTable(
    table: CountedTable,
    tenantId: string,
    activeOnly: boolean,
  ): Promise<number> {
    let query = this.db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (activeOnly) query = query.eq("active", true);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  // Raising the allowance and closing the request must not tear apart, so both
  // live in the accept_customer_request function.
  async acceptRequest(
    requestId: string,
    granted: GrantedCounts,
  ): Promise<DbCustomerRequest> {
    const { data, error } = await this.db.rpc("accept_customer_request", {
      p_request_id: requestId,
      p_granted: granted.customers,
      p_granted_plans: granted.plans,
    });
    if (error) this.handleError(error);
    return data as DbCustomerRequest;
  }

  async declineRequest(requestId: string): Promise<DbCustomerRequest> {
    const { data, error } = await this.db
      .from("customer_requests")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) this.handleError(error);
    return data as DbCustomerRequest;
  }

  async create(payload: CreateTenantPayload): Promise<DbTenant> {
    const { data, error } = await this.db
      .from("tenants")
      .insert(payload)
      .select("*")
      .single();
    if (error) this.handleError(error);
    return data as DbTenant;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbTenant,
        | "name"
        | "active"
        | "customer_allowance"
        | "plan_allowance"
        | "price_per_plan_usd"
      >
    >,
  ): Promise<DbTenant> {
    const { data, error } = await this.db
      .from("tenants")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) this.handleError(error);
    return data as DbTenant;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from("tenants").delete().eq("id", id);
    if (error) this.handleError(error);
  }

  async createDefaultBranch(tenantId: string): Promise<void> {
    const { error } = await this.db
      .from("branches")
      .insert({ tenant_id: tenantId, name: "Default Branch" });
    if (error) this.handleError(error);
  }

  // Reads the global default USD→LBP rate from app_options. Returns null when
  // the row is missing or holds an invalid (non-positive) value so the caller
  // can fall back to a default — a misconfigured option must not block signup.
  async getLiraRate(): Promise<number | null> {
    const { data, error } = await this.db
      .from("app_options")
      .select("value")
      .eq("key", "LiraRate")
      .maybeSingle();
    if (error) this.handleError(error);
    if (!data) return null;
    const rate = Number((data as { value: string | null }).value);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }

  async createLbpCurrency(tenantId: string, ratePerUsd: number): Promise<void> {
    const { error } = await this.db.from("currencies").insert({
      tenant_id: tenantId,
      code: "LBP",
      name: "Lebanese Pound",
      symbol: "ل.ل",
      rate_per_usd: ratePerUsd,
      decimals: 0,
    });
    if (error) this.handleError(error);
  }
}
