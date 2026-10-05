import type { ReactNode } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@shared/shared/lib/menuItem";
import type { ActionMenuItem } from "../components/ActionMenu";
import type { SelectionAction } from "../components/SelectionBar";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type Glyph = keyof typeof Ionicons.glyphMap;

export interface MenuLook<K extends string> {
  icons: Record<K, Glyph>;
  run: Partial<Record<K, () => void>> | ((key: K) => void);
  renderIcons?: Partial<Record<K, (size: number) => ReactNode>>;
  iconBadges?: Partial<Record<K, Glyph>>;
  labelValues?: Record<string, unknown>;
  disabled?: boolean | readonly K[];
}

function handlerOf<K extends string>(
  run: MenuLook<K>["run"],
  key: K,
): (() => void) | undefined {
  return typeof run === "function" ? () => run(key) : run[key];
}

function isDisabled<K extends string>(disabled: boolean | readonly K[] | undefined, key: K): boolean {
  return typeof disabled === "boolean" ? disabled : !!disabled?.includes(key);
}

// A key the screen gave no handler is left out of its menu.
export function toActionMenuItems<K extends string>(
  items: readonly MenuItem<K>[],
  t: Translate,
  look: MenuLook<K>,
): ActionMenuItem[] {
  return items.flatMap((item) => {
    const onPress = handlerOf(look.run, item.key);
    if (!onPress) return [];
    return [
      {
        key: item.key,
        group: item.group,
        label: t(item.labelKey, look.labelValues),
        caption: item.captionKey ? t(item.captionKey) : undefined,
        icon: look.icons[item.key],
        iconBadge: look.iconBadges?.[item.key],
        renderIcon: look.renderIcons?.[item.key],
        disabled: item.disabled || isDisabled(look.disabled, item.key),
        destructive: item.destructive,
        onPress,
      },
    ];
  });
}

export function toSelectionActions<K extends string>(
  items: readonly MenuItem<K>[],
  t: Translate,
  look: MenuLook<K>,
): SelectionAction[] {
  return items.flatMap((item) => {
    const onPress = handlerOf(look.run, item.key);
    if (!onPress) return [];
    return [
      {
        key: item.key,
        group: item.group,
        label: t(item.labelKey, look.labelValues),
        icon: look.icons[item.key],
        renderIcon: look.renderIcons?.[item.key],
        disabled: item.disabled || isDisabled(look.disabled, item.key),
        destructive: item.destructive,
        onPress,
      },
    ];
  });
}
