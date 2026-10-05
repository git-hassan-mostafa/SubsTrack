import type { SvgIconComponent } from "@mui/icons-material";
import type { ActionGroup } from "@shared/shared/lib/actionOrder";
import type { MenuItem } from "@shared/shared/lib/menuItem";

export interface TableAction {
  key: string;
  group?: ActionGroup;
  label: string;
  caption?: string;
  icon: SvgIconComponent;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface TableActionLook<K extends string> {
  icons: Record<K, SvgIconComponent>;
  run: Partial<Record<K, () => void>> | ((key: K) => void);
  labelValues?: Record<string, unknown>;
  disabled?: boolean | readonly K[];
}

function handlerOf<K extends string>(
  run: Partial<Record<K, () => void>> | ((key: K) => void),
  key: K,
): (() => void) | undefined {
  return typeof run === "function" ? () => run(key) : run[key];
}

function isDisabled<K extends string>(disabled: boolean | readonly K[] | undefined, key: K): boolean {
  return typeof disabled === "boolean" ? disabled : !!disabled?.includes(key);
}

// A key the page gave no handler is left out of its menu.
export function toTableActions<K extends string>(
  items: readonly MenuItem<K>[],
  t: Translate,
  look: TableActionLook<K>,
): TableAction[] {
  return items.flatMap((item) => {
    const onClick = handlerOf(look.run, item.key);
    if (!onClick) return [];
    return [
      {
        key: item.key,
        group: item.group,
        label: t(item.labelKey, look.labelValues),
        caption: item.captionKey ? t(item.captionKey) : undefined,
        icon: look.icons[item.key],
        disabled: item.disabled || isDisabled(look.disabled, item.key),
        destructive: item.destructive,
        onClick,
      },
    ];
  });
}
