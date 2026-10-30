import {
  mapDbCustomerRequestToCustomerRequest,
  mapDbTenantToTenant,
} from "@shared/modules/admin/billing/utils/mapper";
import { OPTION_KEYS } from "@shared/modules/options/utils/constants";
import { BaseRepository } from "../../../core/BaseRepository.js";

const COUNTED_TABLES = [
  { key: "users", table: "users", hasActive: true },
  { key: "branches", table: "branches", hasActive: true },
  { key: "customers", table: "customers", hasActive: true },
  { key: "serviceLines", table: "customer_plans", hasActive: true },
  { key: "plans", table: "plans", hasActive: false },
  { key: "products", table: "products", hasActive: true },
  { key: "services", table: "services", hasActive: true },
  { key: "currencies", table: "currencies", hasActive: true },
];

const TENANT_COLUMNS = {
  name: "name",
  tenantCode: "tenant_code",
  active: "active",
  customerAllowance: "customer_allowance",
  planAllowance: "plan_allowance",
  pricePerPlanUsd: "price_per_plan_usd",
  pricingModel: "pricing_model",
  fixedPriceUsd: "fixed_price_usd",
  whatsappEnabled: "whatsapp_enabled",
};

const CODE_TAKEN = { 23505: "This tenant code is already taken." };
const REQUEST_ANSWERED = {
  P0001: "This request was already answered. Refresh the list.",
  PGRST116: "This request was already answered. Refresh the list.",
};
const LOGIN_TAKEN = {
  email_exists: "This owner username is already used for this tenant code.",
  user_already_exists: "This owner username is already used for this tenant code.",
  23505: "This owner username is already taken.",
};

// Fields left undefined are not sent, so an insert takes the column defaults.
function toTenantRow(fields) {
  const row = {};
  for (const [field, column] of Object.entries(TENANT_COLUMNS)) {
    if (fields[field] !== undefined) row[column] = fields[field];
  }
  return row;
}

function mapDbTenantOwner(db) {
  return {
    id: db.id,
    username: db.username,
    fullName: db.full_name,
    active: db.active,
  };
}

export class TenantRepository extends BaseRepository {
  async findAll() {
    const { data, error, status } = await this.db
      .from("tenants")
      .select("*")
      .order("name");
    if (error) this.fail(error, status);
    return (data ?? []).map(mapDbTenantToTenant);
  }

  // One query for the whole list; an embed would drag every old request along.
  async findPendingRequests() {
    const { data, error, status } = await this.db
      .from("customer_requests")
      .select("*")
      .eq("status", "pending");
    if (error) this.fail(error, status);
    return (data ?? []).map(mapDbCustomerRequestToCustomerRequest);
  }

  // HEAD counts, so a tenant holding thousands of rows still costs one number.
  async countRows(tenantId) {
    const entries = await Promise.all(
      COUNTED_TABLES.map(async ({ key, table, hasActive }) => {
        const [total, active] = await Promise.all([
          this.#countTable(table, tenantId, false),
          hasActive ? this.#countTable(table, tenantId, true) : Promise.resolve(null),
        ]);
        return [key, { total, active }];
      }),
    );
    return Object.fromEntries(entries);
  }

  async #countTable(table, tenantId, activeOnly) {
    let query = this.db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (activeOnly) query = query.eq("active", true);
    const { count, error, status } = await query;
    if (error) this.fail(error, status);
    return count ?? 0;
  }

  // Raise + close live in ONE function so they never tear apart — gotcha #146.
  async acceptRequest(requestId, granted) {
    const { data, error, status } = await this.db.rpc("accept_customer_request", {
      p_request_id: requestId,
      p_granted: granted.customers,
      p_granted_plans: granted.plans,
    });
    if (error) this.fail(error, status, REQUEST_ANSWERED);
    return mapDbCustomerRequestToCustomerRequest(data);
  }

  async declineRequest(requestId) {
    const { data, error, status } = await this.db
      .from("customer_requests")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) this.fail(error, status, REQUEST_ANSWERED);
    return mapDbCustomerRequestToCustomerRequest(data);
  }

  async create(fields) {
    const { data, error, status } = await this.db
      .from("tenants")
      .insert(toTenantRow(fields))
      .select("*")
      .single();
    if (error) this.fail(error, status, CODE_TAKEN);
    return mapDbTenantToTenant(data);
  }

  async update(id, fields) {
    const { data, error, status } = await this.db
      .from("tenants")
      .update(toTenantRow(fields))
      .eq("id", id)
      .select("*")
      .single();
    if (error) this.fail(error, status);
    return mapDbTenantToTenant(data);
  }

  async delete(id) {
    const { error, status } = await this.db.from("tenants").delete().eq("id", id);
    if (error) this.fail(error, status);
  }

  async findOwners(tenantId) {
    const { data, error, status } = await this.db
      .from("users")
      .select("id, username, full_name, active")
      .eq("tenant_id", tenantId)
      .eq("role", "superadmin")
      .order("username");
    if (error) this.fail(error, status);
    return (data ?? []).map(mapDbTenantOwner);
  }

  async setPassword(userId, password) {
    const { error } = await this.db.auth.admin.updateUserById(userId, { password });
    if (error) this.fail(error, error.status);
  }

  async createDefaultBranch(tenantId) {
    const { error, status } = await this.db
      .from("branches")
      .insert({ tenant_id: tenantId, name: "Default Branch" });
    if (error) this.fail(error, status);
  }

  async findLiraRateValue() {
    const { data, error, status } = await this.db
      .from("app_options")
      .select("value")
      .eq("key", OPTION_KEYS.liraRate)
      .maybeSingle();
    if (error) this.fail(error, status);
    return data?.value ?? null;
  }

  async createLbpCurrency(tenantId, ratePerUsd) {
    const { error, status } = await this.db.from("currencies").insert({
      tenant_id: tenantId,
      code: "LBP",
      name: "Lebanese Pound",
      symbol: "ل.ل",
      rate_per_usd: ratePerUsd,
      decimals: 0,
    });
    if (error) this.fail(error, status);
  }

  async createOwnerLogin(email, password) {
    const { data, error } = await this.db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) this.fail(error, error.status, LOGIN_TAKEN);
    return data.user.id;
  }

  async insertOwner({ id, username, fullName, tenantId }) {
    const { error, status } = await this.db.from("users").insert({
      id,
      username,
      full_name: fullName,
      role: "superadmin",
      tenant_id: tenantId,
    });
    if (error) this.fail(error, status, LOGIN_TAKEN);
  }

  async deleteOwnerLogin(userId) {
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) this.fail(error, error.status);
  }
}
