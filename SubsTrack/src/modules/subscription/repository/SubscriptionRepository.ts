import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbTierPlan, DbTenant } from "@/src/core/types/db";
import type { TenantUsage } from "@/src/core/types";

export class SubscriptionRepository extends BaseRepository {
  async findAllTiers(): Promise<DbTierPlan[]> {
    const { data, error } = await this.db
      .from("tier_plans")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) this.handleError(error);
    return (data ?? []) as DbTierPlan[];
  }

  async getTenantWithTier(tenantId: string): Promise<DbTenant | null> {
    const { data, error } = await this.db
      .from("tenants")
      .select("*, tier_plans(*)")
      .eq("id", tenantId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      this.handleError(error);
    }
    return data as DbTenant;
  }

  // Count the calling tenant's current usage across each gated resource.
  // RLS restricts the counts to the caller's tenant automatically, so no
  // tenant_id filter is passed (and the count would be wrong without RLS).
  async countTenantUsage(): Promise<TenantUsage> {
    const [customers, users, plans, branches, currencies, products] = await Promise.all([
      this.db
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      this.db
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      this.db.from("plans").select("id", { count: "exact", head: true }),
      this.db
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      this.db
        .from("currencies")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      this.db
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
    ]);
    if (customers.error) this.handleError(customers.error);
    if (users.error) this.handleError(users.error);
    if (plans.error) this.handleError(plans.error);
    if (branches.error) this.handleError(branches.error);
    if (currencies.error) this.handleError(currencies.error);
    if (products.error) this.handleError(products.error);
    return {
      customers: customers.count ?? 0,
      users: users.count ?? 0,
      plans: plans.count ?? 0,
      branches: branches.count ?? 0,
      currencies: currencies.count ?? 0,
      products: products.count ?? 0,
    };
  }

  async upgradeTenant(tenantId: string, tierId: string): Promise<DbTenant> {
    await this.db
      .from("tenants")
      .update({ tier_id: tierId, tier_upgraded_at: new Date().toISOString() })
      .eq("id", tenantId);

    const { data, error } = await this.db
      .from("tenants")
      .select("*, tier_plans(*)")
      .eq("id", tenantId)
      .single();
    if (error) this.handleError(error);
    return data as DbTenant;
  }
}
