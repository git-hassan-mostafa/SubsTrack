import { AppOption } from "@shared/core/types";
import { DbAppOption } from "@shared/core/types/db";

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
