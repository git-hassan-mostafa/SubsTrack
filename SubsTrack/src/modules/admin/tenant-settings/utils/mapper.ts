import { TenantSetting } from "@shared/core/types";
import { DbTenantSetting } from "@shared/core/types/db";

export function mapDbTenantSettingToTenantSetting(
  db: DbTenantSetting,
): TenantSetting {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    key: db.key,
    value: db.value,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
