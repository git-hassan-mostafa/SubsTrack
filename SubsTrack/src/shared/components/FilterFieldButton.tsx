import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "./PressableOpacity";

interface Props {
  text: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  caption?: string;
}

// The value box of one filter-sheet row; every picker's "filter" trigger draws this.
export function FilterFieldButton({
  text,
  active,
  onPress,
  icon = "chevron-down",
  disabled = false,
  caption,
}: Props) {
  const tint = active ? COLORS.primary : COLORS.gray400;
  return (
    <View className="flex-1 min-w-0">
      {caption ? (
        <Text className="text-xs text-gray-500 mb-1" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
      <PressableOpacity
        onPress={onPress}
        disabled={disabled}
        className={`flex-row items-center gap-x-2 rounded-xl border px-3 py-2.5 ${
          disabled
            ? "bg-gray-50 border-gray-100 opacity-50"
            : active
              ? "bg-indigo-50 border-indigo-200"
              : "bg-white border-gray-200"
        }`}
      >
        <Text
          fontWeight={active ? "SemiBold" : undefined}
          className={`flex-1 text-sm ${active ? "text-primary" : "text-gray-700"}`}
          numberOfLines={1}
        >
          {text}
        </Text>
        <Ionicons name={icon} size={14} color={tint} />
      </PressableOpacity>
    </View>
  );
}
