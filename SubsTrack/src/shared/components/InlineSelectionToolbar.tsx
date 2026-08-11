import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import type { SelectionAction } from "./SelectionBar";

interface Props {
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
}

// Compact selection toolbar for a panel EMBEDDED in a screen (the month grid's
// year header, the customer detail sales section) — the in-flow twin of the
// page-level `SelectionBar`. Carries no background/margins of its own, so the
// host decides whether it overlays a row or replaces one.
export function InlineSelectionToolbar({ count, actions, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-2 gap-2">
      <PressableOpacity onPress={onClose} className="p-1" hitSlop={8}>
        <Ionicons name="close" size={20} color={COLORS.gray700} />
      </PressableOpacity>
      {/* `flex-1` so the count keeps its own line and the actions take the rest —
          without it the label is squeezed to one character per line. */}
      <View className="flex-1 min-w-0">
        <Text
          fontWeight="SemiBold"
          className="text-sm text-gray-900"
          numberOfLines={1}
        >
          {t("common.selected_count", { count })}
        </Text>
      </View>
      {/* Icon-only: up to 5 actions (pay / pay & send / skip / send invoice /
          void) are on this one fixed-height row, and labelled pills overflow a
          phone width. */}
      <View className="flex-row items-center gap-1.5">
        {actions.map((action) => (
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
