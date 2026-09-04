import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { Checkbox } from "./Checkbox";

export interface SelectionAction {
  key: string;
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
}

// The selection row shown on every list/panel while selecting, always on ONE
// line: a "select all" checkbox, the close (X) button, the bare selected count,
// then the icon actions. The count is a number only (no "selected" word) —
// spelling it out is what used to push the actions onto a second line on a
// phone. Shared by PageHeader (overlaid on the header) and the Transactions
// panels (rendered inline).
export function SelectionBar({
  count,
  actions,
  onClose,
  allSelected,
  onToggleAll,
}: SelectionBarProps) {
  const { t } = useTranslation();

  const leading = (
    <>
      {onToggleAll ? (
        <PressableOpacity
          onPress={onToggleAll}
          hitSlop={8}
          className="p-1"
          accessibilityLabel={t("common.select_all")}
        >
          <Checkbox checked={!!allSelected} size={22} />
        </PressableOpacity>
      ) : null}
      <PressableOpacity onPress={onClose} className="p-1" hitSlop={8}>
        <Ionicons name="close" size={24} color={COLORS.gray700} />
      </PressableOpacity>
      <Text
        fontWeight="Bold"
        className="text-lg text-gray-900"
        numberOfLines={1}
        accessibilityLabel={t("common.selected_count", { count })}
      >
        {count}
      </Text>
    </>
  );

  // `shrink-0` so a long action row never squeezes itself; the leading cluster
  // is fixed-width anyway, so the whole bar fits.
  const actionRow = (
    <View className="flex-1 flex-row items-center justify-end gap-1 shrink-0">
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
    <View className="flex-row items-center px-4 pt-2 pb-2 bg-white border-b border-gray-100 gap-1">
      {leading}
      {actionRow}
    </View>
  );
}
