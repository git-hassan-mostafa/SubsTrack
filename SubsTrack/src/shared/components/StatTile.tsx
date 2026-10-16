import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import type { Tone as SharedTone } from "@shared/shared/lib/tone";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";

export type StatTone = "default" | "danger" | "success" | "warning" | "primary";

type Tone = StatTone;

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const STAT_TONE: Record<SharedTone, StatTone> = {
  emerald: "success",
  teal: "success",
  red: "danger",
  orange: "warning",
  amber: "warning",
  indigo: "primary",
  violet: "primary",
  sky: "primary",
  gray: "default",
};

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

// the one stat building block for the dashboard and reports grids
export function StatTile({ label, value, sub, tone = "default", icon }: Props) {
  return (
    <View className={`${CARD_SURFACE} flex-1 p-4`}>
      <View className="flex-row items-center gap-2 mb-2">
        {icon ? (
          <Ionicons name={icon} size={16} color={iconColor[tone]} />
        ) : null}
        <Text
          fontWeight="Medium"
          className="flex-1 text-sm text-gray-600"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text fontWeight="Bold" className={`text-2xl mb-0.5 ${valueColor[tone]}`}>
        {value}
      </Text>
      {sub ? <Text className="text-xs text-gray-500">{sub}</Text> : null}
    </View>
  );
}
