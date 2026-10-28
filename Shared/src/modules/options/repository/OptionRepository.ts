import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbAppOption } from "@shared/core/types/db";
import type { IOptionRepository } from "@shared/modules/options/repository/IOptionRepository";

// Read-only; anon reads it too, for the login screen's help and legal links.
export class OptionRepository
  extends BaseRepository
  implements IOptionRepository
{
  async findAll(): Promise<DbAppOption[]> {
    const { data, error } = await this.db
      .from("app_options")
      .select("*")
      .order("key");
    if (error) this.handleError(error);
    return (data ?? []) as DbAppOption[];
  }

  async findByKey(key: string): Promise<DbAppOption | null> {
    const { data, error } = await this.db
      .from("app_options")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data ?? null) as DbAppOption | null;
  }
}
