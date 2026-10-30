import { mapDbAppOptionToAppOption } from "@shared/modules/options/utils/mapper";
import { BaseRepository } from "../../../core/BaseRepository.js";

const KEY_TAKEN = { 23505: "An option with this key already exists." };

export class OptionRepository extends BaseRepository {
  async findAll() {
    const { data, error, status } = await this.db
      .from("app_options")
      .select("*")
      .order("key");
    if (error) this.fail(error, status);
    return (data ?? []).map(mapDbAppOptionToAppOption);
  }

  async create({ key, value, description }) {
    const { data, error, status } = await this.db
      .from("app_options")
      .insert({ key, value, description })
      .select()
      .single();
    if (error) this.fail(error, status, KEY_TAKEN);
    return mapDbAppOptionToAppOption(data);
  }

  async update(id, { value, description }) {
    const { data, error, status } = await this.db
      .from("app_options")
      .update({ value, description })
      .eq("id", id)
      .select()
      .single();
    if (error) this.fail(error, status);
    return mapDbAppOptionToAppOption(data);
  }

  async delete(id) {
    const { error, status } = await this.db.from("app_options").delete().eq("id", id);
    if (error) this.fail(error, status);
  }
}
