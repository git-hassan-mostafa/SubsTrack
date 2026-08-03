import type { DbTenantSetting } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { upsertNaturalKeyDirty } from '@/src/core/offline/db/dml';
import { deterministicId, nowIso } from '@/src/core/offline/ids';
import type { ITenantSettingRepository } from './ITenantSettingRepository';

/**
 * SQLite-backed TenantSetting repository. Reads the local mirror; writes mutate
 * it and flag the row `_dirty` so the next sync pushes it. The id is derived
 * from (tenant_id, key) so two devices setting the same option offline produce
 * the SAME id and converge on replay instead of colliding on the UNIQUE index.
 */
export class OfflineTenantSettingRepository
  extends OfflineBaseRepository
  implements ITenantSettingRepository
{
  async findAll(): Promise<DbTenantSetting[]> {
    const rows = await this.all('SELECT * FROM tenant_settings ORDER BY key');
    return this.decodeAll<DbTenantSetting>('tenant_settings', rows);
  }

  async upsert(tenantId: string, key: string, value: string | null): Promise<DbTenantSetting> {
    const now = nowIso();
    const row: DbTenantSetting = {
      id: await deterministicId(tenantId, key),
      tenant_id: tenantId,
      key,
      value,
      created_at: now,
      updated_at: now,
    };
    const id = await this.write((db) => upsertNaturalKeyDirty(db, 'tenant_settings', row));
    return { ...row, id };
  }
}
