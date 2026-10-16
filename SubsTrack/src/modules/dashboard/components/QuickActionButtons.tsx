import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { RoundAction } from "@/src/shared/components/RoundAction";
import { useUiStore } from "@shared/shared/lib/uiStore";
import {
  quickActionItems,
  type QuickActionItem,
  type QuickActionKey,
} from "@shared/shared/lib/quickActions";
import { QUICK_ACTION_ICONS } from "@/src/shared/lib/quickActionIcons";

const SHORTCUTS = ["collect", "customer", "sale", "expense"] as const;

type Shortcut = (typeof SHORTCUTS)[number];

function isShortcut(
  item: QuickActionItem,
): item is QuickActionItem & { key: Shortcut } {
  return (SHORTCUTS as readonly QuickActionKey[]).includes(item.key);
}

interface Props {
  isAdmin: boolean;
}

// same items as the 3-dot menu; a blocked one is left out, not greyed
export function QuickActionButtons({ isAdmin }: Props) {
  const { t } = useTranslation();
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const items = quickActionItems({ isAdmin })
    .filter(isShortcut)
    .filter((item) => !item.disabled);

  return (
    <View className="flex-row mx-2 mb-4">
      {items.map((item) => (
        <RoundAction
          key={item.key}
          size={56}
          icon={QUICK_ACTION_ICONS[item.key]}
          label={t(item.labelKey)}
          onPress={() => openQuickAction(item.key)}
        />
      ))}
    </View>
  );
}
