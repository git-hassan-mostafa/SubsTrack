import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import type { SelectionAction } from "@/src/shared/components/PageHeader";

interface Props {
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
}

// Selection toolbar that overlays the year-header row, directly above the month
// grid (not the page header). Rendered inside an absolute, bg-white container by
// the panel, so it carries no background/margins of its own.
export function GridSelectionToolbar({ count, actions, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-2 gap-2">
      <PressableOpacity onPress={onClose} className="p-1" hitSlop={8}>
        <Ionicons name="close" size={20} color={COLORS.gray700} />
      </PressableOpacity>
      <View className="flex-1 min-w-0">
        <Text fontWeight="SemiBold" className="text-sm text-gray-900">
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
            className={`flex-row items-center gap-1.5 px-3 h-9 rounded-full bg-white border border-gray-200 ${
              action.disabled ? "opacity-40" : ""
            }`}
          >
            <Ionicons
              name={action.icon}
              size={18}
              color={action.destructive ? COLORS.danger : COLORS.primary}
            />
            <Text
              fontWeight="SemiBold"
              className={`text-sm ${action.destructive ? "text-red-500" : "text-primary"}`}
            >
              {action.label}
            </Text>
          </PressableOpacity>
        ))}
      </View>
    </View>
  );
}
