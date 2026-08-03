import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbTenantSetting } from '@/src/core/types/db';
import type { ITenantSettingRepository } from './ITenantSettingRepository';
import { OfflineTenantSettingRepository } from './TenantSettingRepository.offline';

// Per-tenant key/value config. RLS scopes every read to the caller's tenant and
// restricts writes to admins, so no tenant filter is applied here.
export class TenantSettingRepository
  extends BaseRepository
  implements ITenantSettingRepository
{
  async findAll(): Promise<DbTenantSetting[]> {
    const { data, error } = await this.db
      .from('tenant_settings')
      .select('*')
      .order('key');
    if (error) this.handleError(error);
    return (data ?? []) as DbTenantSetting[];
  }

  async upsert(tenantId: string, key: string, value: string | null): Promise<DbTenantSetting> {
    // Upsert on the (tenant_id, key) natural key — the row may already exist
    // under an id this client never saw (set on the web or another device).
    const { data, error } = await this.db
      .from('tenant_settings')
      .upsert({ tenant_id: tenantId, key, value }, { onConflict: 'tenant_id,key' })
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbTenantSetting;
  }
}

// Platform seam: web talks to Supabase directly; native reads/writes the local
// mirror and syncs. Services import this default.
const impl: ITenantSettingRepository =
  Platform.OS === 'web' ? new TenantSettingRepository() : new OfflineTenantSettingRepository();

export default impl;
