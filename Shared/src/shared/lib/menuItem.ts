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

export function pickMenu<K extends string>(
  table: MenuTable<K>,
  keys: readonly K[],
): MenuItem<K>[] {
  return keys.map((key) => ({ key, ...table[key] }));
}
