import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { QuotaKind } from "@shared/modules/admin/billing/utils/types";
import { usageOf, type UsageLevel } from "@shared/modules/admin/billing/utils/usage";

interface Props {
  kind: QuotaKind;
  used: number;
  total: number;
}

const LEVEL_TONE: Record<UsageLevel, { fill: string; text: string }> = {
  full: { fill: "bg-danger", text: "text-danger" },
  near: { fill: "bg-warning", text: "text-warning" },
  ok: { fill: "bg-primary", text: "text-gray-900" },
};

export function UsageBar({ kind, used, total }: Props) {
  const { t } = useTranslation();
  const usage = usageOf(used, total);
  const tone = LEVEL_TONE[usage.level];

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
          style={{ width: `${usage.percent}%` }}
        />
      </View>

      <Text className="text-xs text-gray-500 mt-2">
        {usage.full
          ? t("billing.usage_full")
          : t(`billing.remaining_${kind}`, { count: usage.remaining })}
      </Text>
    </View>
  );
}
