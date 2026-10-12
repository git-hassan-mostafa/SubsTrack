import type { ActionGroup } from "./actionOrder";

// One row of a menu as both apps read it; each app adds the icon and handler.
export interface MenuItem<K extends string> {
  key: K;
  group: ActionGroup;
  labelKey: string;
  captionKey?: string;
  disabled?: boolean;
  destructive?: boolean;
}

export type MenuTable<K extends string> = Record<K, Omit<MenuItem<K>, "key">>;

export type MenuReasons<K extends string> = Partial<Record<K, string | null | false | undefined>>;

export const ADMIN_ONLY = "why_disabled.admin_only";

// A blocked action stays in the menu, greyed, saying why — never hidden.
export function withReason<K extends string>(
  item: MenuItem<K>,
  reasonKey: string | null | false | undefined,
): MenuItem<K> {
  return reasonKey ? { ...item, disabled: true, captionKey: reasonKey } : item;
}

export function pickMenu<K extends string>(
  table: MenuTable<K>,
  keys: readonly K[],
  reasons: MenuReasons<K> = {},
): MenuItem<K>[] {
  return keys.map((key) => withReason({ key, ...table[key] }, reasons[key]));
}
