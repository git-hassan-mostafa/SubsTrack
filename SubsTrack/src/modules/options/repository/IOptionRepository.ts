import type { DbAppOption } from '@/src/core/types/db';

/**
 * The Option repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 * app_options is a global read-only cache (no writes from SubsTrack).
 */
export interface IOptionRepository {
  findAll(): Promise<DbAppOption[]>;
  findByKey(key: string): Promise<DbAppOption | null>;
}
