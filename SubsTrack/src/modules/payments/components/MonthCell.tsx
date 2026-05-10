import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { getCurrentYearMonth } from "@/src/core/utils/date";
import type { MonthEntry, MonthStatus } from "@/src/core/types";

interface Props {
  entry: MonthEntry;
  onPress: (entry: MonthEntry) => void;
}

const bgColor: Record<MonthStatus, string> = {
  paid: "bg-green-500",
  unpaid: "bg-red-500",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
};

const textColor: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-white",
  future: "text-gray-400",
  before_start: "text-gray-300",
};

export const MonthCell = memo(function MonthCell({ entry, onPress }: Props) {
  const { t } = useTranslation();
  const { year: cy, month: cm } = getCurrentYearMonth();
  const isCurrentMonth = entry.year === cy && entry.month === cm;

  const containerBg =
    isCurrentMonth && entry.status === "unpaid"
      ? "bg-red-100 border-2 border-red-500"
      : bgColor[entry.status];

  const labelColor =
    isCurrentMonth && entry.status === "unpaid"
      ? "text-red-600"
      : textColor[entry.status];

  const sublabel = (() => {
    if (entry.status === "paid") return t("common.paid");
    if (isCurrentMonth) return t("payments.this_month").toUpperCase();
    return null;
  })();

  return (
    <Pressable onPress={() => onPress(entry)} className="w-1/4 p-1">
      <View
        className={`rounded-xl items-center justify-center py-3 ${containerBg}`}
      >
        <Text fontWeight="SemiBold" className={`text-sm ${labelColor}`}>
          {t(`months.${entry.label}`)}
        </Text>
        <Text className={`text-[8px] font-semibold mt-0.5 ${labelColor}`}>
          {sublabel ?? " "}
        </Text>
      </View>
    </Pressable>
  );
});
