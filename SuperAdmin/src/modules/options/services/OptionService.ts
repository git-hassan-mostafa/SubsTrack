import type { AppOption } from "@/src/core/types";
import type { DbAppOption } from "@/src/core/types/db";
import { OptionRepository } from "../repository/OptionRepository";

export function mapDbAppOptionToAppOption(db: DbAppOption): AppOption {
  return {
    id: db.id,
    key: db.key,
    value: db.value,
    description: db.description,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export interface OptionInput {
  key: string;
  value: string;
  description: string | null;
}

export class OptionService {
  private repository = new OptionRepository();

  async getOptions(): Promise<AppOption[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbAppOptionToAppOption);
  }

  async createOption(data: OptionInput): Promise<AppOption> {
    const normalized = this.validate(data);
    const row = await this.repository.create({
      key: normalized.key,
      value: normalized.value,
      description: normalized.description,
    });
    return mapDbAppOptionToAppOption(row);
  }

  // The key is immutable after creation (it's the identifier other code looks
  // up, e.g. 'LiraRate') — only value + description are updatable.
  async updateOption(id: string, data: OptionInput): Promise<AppOption> {
    const normalized = this.validate(data);
    const row = await this.repository.update(id, {
      value: normalized.value,
      description: normalized.description,
    });
    return mapDbAppOptionToAppOption(row);
  }

  async deleteOption(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  private validate(data: OptionInput): OptionInput {
    const key = (data.key ?? "").trim();
    if (!key) throw new Error("Key is required");
    if (!/^[A-Za-z0-9_.]+$/.test(key)) {
      throw new Error(
        "Key may only contain letters, numbers, dots, and underscores",
      );
    }
    const value = (data.value ?? "").trim();
    if (!value) throw new Error("Value is required");
    const description = data.description?.trim() || null;
    return { key, value, description };
  }
}
