import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbTenant } from "@/src/core/types/db";

export class TenantRepository extends BaseRepository {
  async findAll(): Promise<DbTenant[]> {
    const { data, error } = await this.db
      .from("tenants")
      .select("*, tier_plans(*)")
      .order("name");
    if (error) this.handleError(error);
    return (data ?? []) as DbTenant[];
  }

  async getFreeTierId(): Promise<string> {
    const { data, error } = await this.db
      .from("tier_plans")
      .select("id")
      .eq("code", "free")
      .single();
    if (error) this.handleError(error);
    return (data as { id: string }).id;
  }

  async create(
    payload: Pick<DbTenant, "name" | "tenant_code" | "tier_id">,
  ): Promise<DbTenant> {
    const { data, error } = await this.db
      .from("tenants")
      .insert(payload)
      .select("*, tier_plans(*)")
      .single();
    if (error) this.handleError(error);
    return data as DbTenant;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbTenant, "name" | "active" | "tier_id" | "tier_upgraded_at">>,
  ): Promise<DbTenant> {
    const { data, error } = await this.db
      .from("tenants")
      .update(payload)
      .eq("id", id)
      .select("*, tier_plans(*)")
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
