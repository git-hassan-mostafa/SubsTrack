import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";

type Tone = "default" | "danger" | "success" | "warning" | "primary";

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

const valueColor: Record<Tone, string> = {
  default: "text-gray-900",
  danger: "text-danger",
  success: "text-success",
  warning: "text-warning",
  primary: "text-primary",
};

const iconColor: Record<Tone, string> = {
  default: COLORS.gray400,
  danger: COLORS.danger,
  success: COLORS.success,
  warning: COLORS.warning,
  primary: COLORS.primary,
};

// One compact metric: label, big value, optional sub-line and leading icon.
// The shared building block for the dashboard stat grid.
export function StatTile({ label, value, sub, tone = "default", icon }: Props) {
  return (
    <View className="flex-1 bg-white border border-gray-100 rounded-2xl p-4">
      <View className="flex-row items-center gap-1.5 mb-3">
        {icon ? <Ionicons name={icon} size={13} color={iconColor[tone]} /> : null}
        <Text className="text-xs text-gray-400 uppercase tracking-wide">{label}</Text>
      </View>
      <Text
        fontWeight="Bold"
        className={`text-3xl leading-none mb-1 ${valueColor[tone]}`}
      >
        {value}
      </Text>
      {sub ? <Text className="text-xs text-gray-400">{sub}</Text> : null}
    </View>
  );
}
