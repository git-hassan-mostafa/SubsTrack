import { TenantSetting } from '@/src/core/types';
import { DbTenantSetting } from '@/src/core/types/db';

export function mapDbTenantSettingToTenantSetting(db: DbTenantSetting): TenantSetting {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    key: db.key,
    value: db.value,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
