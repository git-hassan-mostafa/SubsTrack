import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbTenantSetting } from "@shared/core/types/db";
import type { ITenantSettingRepository } from "@shared/modules/admin/tenant-settings/repository/ITenantSettingRepository";

// Per-tenant key/value config. RLS scopes every read to the caller's tenant and
// restricts writes to admins, so no tenant filter is applied here.
export class TenantSettingRepository
  extends BaseRepository
  implements ITenantSettingRepository
{
  async findAll(): Promise<DbTenantSetting[]> {
    const { data, error } = await this.db
      .from("tenant_settings")
      .select("*")
      .order("key");
    if (error) this.handleError(error);
    return (data ?? []) as DbTenantSetting[];
  }

  async upsert(
    tenantId: string,
    key: string,
    value: string | null,
  ): Promise<DbTenantSetting> {
    const { data: prior } = await this.db
      .from("tenant_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("key", key)
      .maybeSingle();
    const { data, error } = await this.db
      .from("tenant_settings")
      .upsert(
        { tenant_id: tenantId, key, value },
        { onConflict: "tenant_id,key" },
      )
      .select()
      .single();
    if (error) this.handleError(error);
    const saved = data as DbTenantSetting;
    this.audit({
      table: "tenant_settings",
      recordId: saved.id,
      action: prior ? "update" : "create",
      before: prior,
      after: saved,
    });
    return saved;
  }
}
