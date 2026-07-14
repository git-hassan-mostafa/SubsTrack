import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";
import { Checkbox } from "./Checkbox";

export interface SelectionAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Used as the accessibility label — the toolbar renders icons only. */
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface SelectionBarProps {
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
  /** True when every visible row is selected — drives the leading checkbox. */
  allSelected?: boolean;
  /** Selects every visible row when not all selected; clears them when all are. */
  onToggleAll?: () => void;
}

// The single selection row shown on every list/panel while selecting. It carries
// everything on one line: a leading "select all" checkbox, the close (X) button,
// the selected count, then a row of icon actions. Shared by PageHeader (overlaid
// on the header) and the Transactions panels (rendered inline).
export function SelectionBar({
  count,
  actions,
  onClose,
  allSelected,
  onToggleAll,
}: SelectionBarProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-4 pt-4 pb-4 bg-white border-b border-gray-100 gap-2">
      {onToggleAll ? (
        <PressableOpacity
          onPress={onToggleAll}
          hitSlop={8}
          className="p-1 me-1"
          accessibilityLabel={t("common.select_all")}
        >
          <Checkbox checked={!!allSelected} size={22} />
        </PressableOpacity>
      ) : null}
      <PressableOpacity onPress={onClose} className="p-1 me-1" hitSlop={8}>
        <Ionicons name="close" size={24} color={COLORS.gray700} />
      </PressableOpacity>
      <View className="flex-1 min-w-0">
        <Text fontWeight="Bold" className="text-lg text-gray-900">
          {t("common.selected_count", { count })}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        {actions.map((action) => (
          <PressableOpacity
            key={action.key}
            onPress={action.onPress}
            disabled={action.disabled}
            hitSlop={8}
            accessibilityLabel={action.label}
            className={`w-10 h-10 items-center justify-center rounded-full ${
              action.disabled ? "opacity-40" : ""
            }`}
          >
            <Ionicons
              name={action.icon}
              size={22}
              color={action.destructive ? COLORS.danger : COLORS.gray700}
            />
          </PressableOpacity>
        ))}
      </View>
    </View>
  );
}
