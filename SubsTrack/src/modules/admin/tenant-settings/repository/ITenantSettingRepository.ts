import type { DbTenantSetting } from '@/src/core/types/db';

/**
 * The TenantSetting repository contract. Both the Supabase (online/web) class
 * and the offline SQLite class implement this — the compiler keeps the two in
 * lockstep. Rows are keyed on (tenant_id, key), so writes are an upsert on that
 * natural key rather than an insert-or-update by id.
 */
export interface ITenantSettingRepository {
  findAll(): Promise<DbTenantSetting[]>;
  /** Insert or replace the row for `key` within `tenantId`. */
  upsert(tenantId: string, key: string, value: string | null): Promise<DbTenantSetting>;
}
