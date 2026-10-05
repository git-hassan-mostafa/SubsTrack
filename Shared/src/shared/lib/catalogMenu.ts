import { pickMenu, type MenuItem, type MenuTable } from "./menuItem";

export type CatalogKind = "branch" | "currency" | "plan" | "product" | "service";

export type CatalogActionKey =
  | "edit"
  | "stock"
  | "history"
  | "deactivate"
  | "reactivate"
  | "delete";

export type CatalogMenuItem = MenuItem<CatalogActionKey>;

// A plan has no active flag: it is live until deleted.
function isActive(row: object): boolean {
  return !("active" in row) || row.active !== false;
}

// "toggle" pauses and resumes; "restore" means delete IS the pause (soft delete).
interface CatalogRules {
  status: "toggle" | "restore" | "none";
  stock: boolean;
  deactivateKey: string;
  reactivateKey: string;
}

const RULES: Record<CatalogKind, CatalogRules> = {
  branch: {
    status: "toggle",
    stock: false,
    deactivateKey: "branches.deactivate",
    reactivateKey: "branches.reactivate",
  },
  currency: {
    status: "toggle",
    stock: false,
    deactivateKey: "tenant_settings.deactivate",
    reactivateKey: "tenant_settings.reactivate",
  },
  plan: { status: "none", stock: false, deactivateKey: "", reactivateKey: "" },
  product: {
    status: "restore",
    stock: true,
    deactivateKey: "",
    reactivateKey: "common.reactivate",
  },
  service: {
    status: "restore",
    stock: false,
    deactivateKey: "",
    reactivateKey: "common.reactivate",
  },
};

function menuOf(kind: CatalogKind): MenuTable<CatalogActionKey> {
  const rules = RULES[kind];
  return {
    edit: { group: "manage", labelKey: "common.edit" },
    stock: { group: "manage", labelKey: "products.adjust_stock_title" },
    history: { group: "history", labelKey: "audit.history" },
    deactivate: { group: "status", labelKey: rules.deactivateKey, destructive: true },
    reactivate: { group: "status", labelKey: rules.reactivateKey },
    delete: { group: "danger", labelKey: "common.delete", destructive: true },
  };
}

function statusKeys(rules: CatalogRules, active: boolean): CatalogActionKey[] {
  if (rules.status === "toggle") return [active ? "deactivate" : "reactivate"];
  if (rules.status === "restore" && !active) return ["reactivate"];
  return [];
}

export function catalogRowActions(kind: CatalogKind, row: object): CatalogMenuItem[] {
  const rules = RULES[kind];
  const active = isActive(row);
  const keys: CatalogActionKey[] = ["edit"];
  if (rules.stock && active) keys.push("stock");
  keys.push("history", ...statusKeys(rules, active));
  if (rules.status !== "restore" || active) keys.push("delete");
  return pickMenu(menuOf(kind), keys);
}

// A pick of several only deletes; one row also edits and changes status.
export function catalogSelectionActions(
  kind: CatalogKind,
  selected: readonly object[],
): CatalogMenuItem[] {
  if (selected.length === 0) return [];
  if (selected.length > 1) return pickMenu(menuOf(kind), ["delete"]);
  const rules = RULES[kind];
  const active = isActive(selected[0]);
  const keys: CatalogActionKey[] = ["edit"];
  if (rules.stock && active) keys.push("stock");
  keys.push(...statusKeys(rules, active), "delete");
  return pickMenu(menuOf(kind), keys);
}
