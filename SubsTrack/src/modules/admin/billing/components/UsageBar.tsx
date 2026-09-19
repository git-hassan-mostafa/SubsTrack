import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { QuotaKind } from "../utils/types";

interface Props {
  kind: QuotaKind;
  used: number;
  total: number;
}

// Amber from 80% of the allowance, red once it is full or over — the admin
// should see the wall coming before they hit it.
function toneFor(used: number, total: number): { fill: string; text: string } {
  if (total === 0 || used >= total)
    return { fill: "bg-danger", text: "text-danger" };
  if (used / total >= 0.8) return { fill: "bg-warning", text: "text-warning" };
  return { fill: "bg-primary", text: "text-gray-900" };
}

export function UsageBar({ kind, used, total }: Props) {
  const { t } = useTranslation();
  const tone = toneFor(used, total);
  const percent = total === 0 ? 100 : Math.min(100, (used / total) * 100);
  const remaining = Math.max(0, total - used);

  return (
    <View>
      <View className="flex-row items-end justify-between mb-2">
        <Text fontWeight="SemiBold" className={`text-2xl ${tone.text}`}>
          {used}
          <Text className="text-base text-gray-400">{` / ${total}`}</Text>
        </Text>
        <Text className="text-xs text-gray-500 mb-1">
          {t(`billing.used_${kind}`)}
        </Text>
      </View>

      <View className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <View
          className={`h-full rounded-full ${tone.fill}`}
          style={{ width: `${percent}%` }}
        />
      </View>

      <Text className="text-xs text-gray-500 mt-2">
        {used >= total
          ? t("billing.usage_full")
          : t(`billing.remaining_${kind}`, { count: remaining })}
      </Text>
    </View>
  );
}
