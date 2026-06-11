import type { AppOption } from '@/src/core/types';
import type { DbAppOption } from '@/src/core/types/db';
import repository from '../repository/OptionRepository';

function mapDbAppOptionToAppOption(db: DbAppOption): AppOption {
  return {
    id: db.id,
    key: db.key,
    value: db.value,
    description: db.description,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// Well-known global option keys. Mirrors the rows seeded in script.sql and
// managed from SuperAdmin's Options page. Add new keys here as they are
// introduced so call sites reference a constant, not a magic string.
export const OPTION_KEYS = {
  liraRate: 'LiraRate',
} as const;

// Read-only business layer over the global app_options table.
class OptionService {
  async getOptions(): Promise<AppOption[]> {
    const rows = await repository.findAll();
    return rows.map(mapDbAppOptionToAppOption);
  }

  async getOptionValue(key: string): Promise<string | null> {
    const row = await repository.findByKey(key);
    return row ? row.value : null;
  }
}

export default new OptionService();
