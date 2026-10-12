import type { MenuItem } from "@shared/shared/lib/menuItem";

export const keysOf = <K extends string>(items: readonly MenuItem<K>[]): K[] =>
  items.map((item) => item.key);

export const enabledKeys = <K extends string>(items: readonly MenuItem<K>[]): K[] =>
  items.filter((item) => !item.disabled).map((item) => item.key);

// Each greyed row and the reason it shows.
export const greyed = <K extends string>(
  items: readonly MenuItem<K>[],
): Partial<Record<K, string | undefined>> =>
  Object.fromEntries(
    items.filter((item) => item.disabled).map((item) => [item.key, item.captionKey]),
  ) as Partial<Record<K, string | undefined>>;
