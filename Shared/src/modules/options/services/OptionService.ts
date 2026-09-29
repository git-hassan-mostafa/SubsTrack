import { repositories } from "@shared/core/runtime/repositories";
import type { AppOption } from "@shared/core/types";
import { mapDbAppOptionToAppOption } from "@shared/modules/options/utils/mapper";

// Read-only business layer over the global app_options table.
class OptionService {
  async getOptions(): Promise<AppOption[]> {
    const rows = await repositories().option.findAll();
    return rows.map(mapDbAppOptionToAppOption);
  }

  async getOptionValue(key: string): Promise<string | null> {
    const row = await repositories().option.findByKey(key);
    return row ? row.value : null;
  }
}

export default new OptionService();
