import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";
import type { SelectionAction } from "./SelectionBar";
import { sortActions } from "@/src/shared/lib/actionOrder";

interface Props {
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
}

// The in-flow twin of SelectionBar: no background or margins, the host decides.
export function InlineSelectionToolbar({ count, actions, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-2 gap-2">
      <PressableOpacity onPress={onClose} className="p-1" hitSlop={8}>
        <Ionicons name="close" size={20} color={COLORS.gray700} />
      </PressableOpacity>
      <View className="flex-1 min-w-0">
        <Text
          fontWeight="SemiBold"
          className="text-sm text-gray-900"
          numberOfLines={1}
        >
          {t("common.selected_count", { count })}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {sortActions(actions).map((action) => (
          <PressableOpacity
            key={action.key}
            onPress={action.onPress}
            disabled={action.disabled}
            hitSlop={8}
            accessibilityLabel={action.label}
            className={`w-9 h-9 rounded-full items-center justify-center bg-white border border-gray-200 ${
              action.disabled ? "opacity-40" : ""
            }`}
          >
            {action.renderIcon ? (
              action.renderIcon(18)
            ) : (
              <Ionicons
                name={action.icon}
                size={18}
                color={action.destructive ? COLORS.danger : COLORS.primary}
              />
            )}
          </PressableOpacity>
        ))}
      </View>
    </View>
  );
}
