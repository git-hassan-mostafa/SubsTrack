import type { DbAppOption } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import type { IOptionRepository } from './IOptionRepository';

/**
 * SQLite-backed Option repository. Reads from the local mirror only. app_options
 * is a global read-only cache filled by the sync engine's pull — SubsTrack never
 * writes options (that is the SuperAdmin app's responsibility, service role).
 * Returns the same `DbAppOption` shapes as the Supabase repository.
 */
export class OfflineOptionRepository extends OfflineBaseRepository implements IOptionRepository {
  async findAll(): Promise<DbAppOption[]> {
    const rows = await this.all('SELECT * FROM app_options ORDER BY key');
    return this.decodeAll<DbAppOption>('app_options', rows);
  }

  async findByKey(key: string): Promise<DbAppOption | null> {
    const row = await this.first('SELECT * FROM app_options WHERE key = ?', [key]);
    return this.decodeOne<DbAppOption>('app_options', row);
  }
}
