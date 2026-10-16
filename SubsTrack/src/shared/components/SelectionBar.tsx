import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";
import { Checkbox } from "./Checkbox";
import { IconButton } from "./IconButton";
import { sortActions, type ActionGroup } from "@shared/shared/lib/actionOrder";

export interface SelectionAction {
  key: string;
  group?: ActionGroup;
  icon: keyof typeof Ionicons.glyphMap;
  renderIcon?: (size: number) => React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface SelectionBarProps {
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
  allSelected?: boolean;
  onToggleAll?: () => void;
  className?: string;
}

// The count is a bare number; the word "selected" pushed actions to a 2nd line.
export function SelectionBar({
  count,
  actions,
  onClose,
  allSelected,
  onToggleAll,
  className = "",
}: SelectionBarProps) {
  const { t } = useTranslation();

  const leading = (
    <>
      <IconButton
        icon="close"
        onPress={onClose}
        accessibilityLabel={t("common.close")}
      />
      {onToggleAll ? (
        <PressableOpacity
          onPress={onToggleAll}
          ripple="borderless"
          className="w-12 h-12 items-center justify-center"
          accessibilityLabel={t("common.select_all")}
        >
          <Checkbox checked={!!allSelected} size={22} />
        </PressableOpacity>
      ) : null}
      <Text
        fontWeight="SemiBold"
        className="text-[22px] text-gray-900 ms-1"
        numberOfLines={1}
        accessibilityLabel={t("common.selected_count", { count })}
      >
        {count}
      </Text>
    </>
  );

  const actionRow = (
    <View className="flex-1 flex-row items-center justify-end shrink-0">
      {sortActions(actions).map((action) => (
        <PressableOpacity
          key={action.key}
          onPress={action.onPress}
          disabled={action.disabled}
          ripple="borderless"
          accessibilityLabel={action.label}
          className={`w-12 h-12 items-center justify-center ${
            action.disabled ? "opacity-40" : ""
          }`}
        >
          {action.renderIcon ? (
            action.renderIcon(22)
          ) : (
            <Ionicons
              name={action.icon}
              size={22}
              color={action.destructive ? COLORS.danger : COLORS.gray700}
            />
          )}
        </PressableOpacity>
      ))}
    </View>
  );

  return (
    <View
      className={`flex-row items-center ps-1 pe-1 py-1 min-h-16 bg-primary-container ${className}`}
    >
      {leading}
      {actionRow}
    </View>
  );
}
