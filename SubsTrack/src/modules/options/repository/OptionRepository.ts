import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbAppOption } from '@/src/core/types/db';

// Read-only access to the global app_options table. SubsTrack never writes
// options — that is the SuperAdmin app's responsibility (service role). RLS
// allows both anon and authenticated to SELECT (anon is required because some
// flags gate pre-auth UI, e.g. self-service signup on the login screen).
class OptionRepository extends BaseRepository {
  async findAll(): Promise<DbAppOption[]> {
    const { data, error } = await this.db
      .from('app_options')
      .select('*')
      .order('key');
    if (error) this.handleError(error);
    return (data ?? []) as DbAppOption[];
  }

  async findByKey(key: string): Promise<DbAppOption | null> {
    const { data, error } = await this.db
      .from('app_options')
      .select('*')
      .eq('key', key)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data ?? null) as DbAppOption | null;
  }
}

export default new OptionRepository();
