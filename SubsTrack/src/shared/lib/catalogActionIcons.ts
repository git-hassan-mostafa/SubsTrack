import type { CatalogActionKey } from "@shared/shared/lib/catalogMenu";
import type { Glyph } from "./menuActions";

export const CATALOG_ACTION_ICONS: Record<CatalogActionKey, Glyph> = {
  edit: "create-outline",
  stock: "cube-outline",
  history: "time-outline",
  deactivate: "pause-circle-outline",
  reactivate: "play-circle-outline",
  delete: "trash-outline",
};
