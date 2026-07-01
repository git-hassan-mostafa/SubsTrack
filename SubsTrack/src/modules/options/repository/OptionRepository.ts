import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbAppOption } from '@/src/core/types/db';
import type { IOptionRepository } from './IOptionRepository';
import { OfflineOptionRepository } from './OptionRepository.offline';

// Read-only access to the global app_options table. SubsTrack never writes
// options — that is the SuperAdmin app's responsibility (service role). RLS
// allows both anon and authenticated to SELECT (anon is required because some
// flags gate pre-auth UI, e.g. self-service signup on the login screen).
export class OptionRepository extends BaseRepository implements IOptionRepository {
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

// Platform seam: web talks to Supabase directly (unchanged); native reads the
// local mirror. Services import this default, so neither services nor slices
// change. The offline class is only constructed on native, so web never opens
// a local DB.
const impl: IOptionRepository =
  Platform.OS === 'web' ? new OptionRepository() : new OfflineOptionRepository();

export default impl;
