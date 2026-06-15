import { AppOption } from "@/src/core/types";
import { DbAppOption } from "@/src/core/types/db";

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
