import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbAppOption } from "@/src/core/types/db";

export class OptionRepository extends BaseRepository {
  async findAll(): Promise<DbAppOption[]> {
    const { data, error } = await this.db
      .from("app_options")
      .select("*")
      .order("key");
    if (error) this.handleError(error);
    return (data ?? []) as DbAppOption[];
  }

  async create(
    payload: Pick<DbAppOption, "key" | "value" | "description">,
  ): Promise<DbAppOption> {
    const { data, error } = await this.db
      .from("app_options")
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbAppOption;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbAppOption, "value" | "description">>,
  ): Promise<DbAppOption> {
    const { data, error } = await this.db
      .from("app_options")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbAppOption;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from("app_options").delete().eq("id", id);
    if (error) this.handleError(error);
  }
}
