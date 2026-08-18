import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Delta } from "../utils/aggregate";

interface Props {
  delta: Delta;
  /** false when going UP is bad (spending) — flips only the colour, never the arrow. */
  higherIsBetter?: boolean;
}

/**
 * "▲ 12% vs last period". Hidden entirely when the previous period was zero:
 * there is no percentage from nothing, and "+∞%" reads as a bug.
 */
export function ComparisonPill({ delta, higherIsBetter = true }: Props) {
  const { t } = useTranslation();
  if (delta.pct === null || delta.pct === 0) return null;

  const up = delta.pct > 0;
  const good = up === higherIsBetter;
  const color = good ? COLORS.success : COLORS.danger;

  return (
    <View className="flex-row items-center gap-1">
      <Ionicons name={up ? "arrow-up" : "arrow-down"} size={11} color={color} />
      <Text className="text-xs" style={{ color }}>
        {Math.abs(Math.round(delta.pct * 100))}%
      </Text>
      <Text className="text-xs text-gray-400">{t("reports.vs_previous")}</Text>
    </View>
  );
}
