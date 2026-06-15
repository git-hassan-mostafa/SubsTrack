import type { AppOption } from '@/src/core/types';
import repository from '../repository/OptionRepository';
import { mapDbAppOptionToAppOption } from '../utils/mapper';


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
