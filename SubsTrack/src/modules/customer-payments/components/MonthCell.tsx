import { memo } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { getCurrentYearMonth } from "@/src/core/utils/date";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import type { MonthEntry, MonthStatus } from "@/src/core/types";

interface Props {
  entry: MonthEntry;
  onPress: (entry: MonthEntry) => void;
  onMenu?: (entry: MonthEntry) => void;
  menuLoading?: boolean;
  isRegular: boolean;
  connectLeft?: boolean;
  connectRight?: boolean;
  wrapFromPrev?: boolean;
  wrapToNext?: boolean;
}

const regularBgColor: Record<MonthStatus, string> = {
  paid: "bg-green-500",
  partial: "bg-amber-500",
  unpaid: "bg-red-500",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
};

const nonRegularBgColor: Record<MonthStatus, string> = {
  paid: "bg-yellow-400",
  partial: "bg-amber-500",
  unpaid: "bg-gray-200",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
};

const regularTextColor: Record<MonthStatus, string> = {
  paid: "text-white",
  partial: "text-white",
  unpaid: "text-white",
  future: "text-gray-400",
  before_start: "text-gray-300",
};

const nonRegularTextColor: Record<MonthStatus, string> = {
  paid: "text-white",
  partial: "text-white",
  unpaid: "text-gray-400",
  future: "text-gray-400",
  before_start: "text-gray-300",
};

export const MonthCell = memo(function MonthCell({
  entry,
  onPress,
  onMenu,
  menuLoading = false,
  isRegular,
  connectLeft = false,
  connectRight = false,
  wrapFromPrev = false,
  wrapToNext = false,
}: Props) {
  const { t } = useTranslation();
  const { year: cy, month: cm } = getCurrentYearMonth();
  const isCurrentMonth = entry.year === cy && entry.month === cm;

  const bgColor = isRegular ? regularBgColor : nonRegularBgColor;
  const textColor = isRegular ? regularTextColor : nonRegularTextColor;

  const containerBg =
    isRegular && isCurrentMonth && entry.status === "unpaid"
      ? "bg-red-100 border-2 border-red-500"
      : bgColor[entry.status];

  const labelColor =
    isRegular && isCurrentMonth && entry.status === "unpaid"
      ? "text-red-600"
      : textColor[entry.status];

  // The 3-dot menu only makes sense on months that can be acted on: record a
  // payment (unpaid / future) or open / void an existing one (paid / partial).
  // Only before-start cells stay tap-only.
  const showMenu = !!onMenu && entry.status !== "before_start";

  // Match the dots to the label colour so they stay visible on every cell type.
  const usesWhiteText =
    entry.status === "paid" ||
    entry.status === "partial" ||
    (isRegular && entry.status === "unpaid");
  const menuIconColor =
    isRegular && isCurrentMonth && entry.status === "unpaid"
      ? COLORS.danger
      : usesWhiteText
        ? COLORS.white
        : COLORS.gray500;

  const sublabel = (() => {
    if ((entry.status === "paid" || entry.status === "partial") && entry.isGroupSecondary)
      return t("payments.included_label");
    if (entry.status === "partial") return t("payments.partial_badge");
    if (entry.status === "paid") return t("common.paid");
    if (isCurrentMonth) return t("payments.this_month").toUpperCase();
    return null;
  })();

  // In-row neighbours: drop the outer gap on the connecting side so cells touch.
  // Cross-row neighbours: keep the gap but square the corner on that side and
  // render a chevron, so the wrap reads as continuation rather than a separate pill.
  const padClass = `${connectLeft ? "ps-0" : "ps-1"} ${
    connectRight ? "pe-0" : "pe-1"
  } py-1`;

  const leftSquare = connectLeft || wrapFromPrev;
  const rightSquare = connectRight || wrapToNext;

  let roundClass: string;
  if (leftSquare && rightSquare) roundClass = "rounded-none";
  else if (leftSquare) roundClass = "rounded-tr-xl rounded-br-xl";
  else if (rightSquare) roundClass = "rounded-tl-xl rounded-bl-xl";
  else roundClass = "rounded-xl";

  return (
    <PressableOpacity
      onPress={() => onPress(entry)}
      className={`w-1/4 aspect-square ${padClass}`}
    >
      <View
        className={`${roundClass} items-center justify-center flex-1 w-full ${containerBg}`}
      >
        <Text fontWeight="SemiBold" className={`text-sm ${labelColor}`}>
          {t(`months.${entry.label}`)}
        </Text>
        <Text className={`text-[8px] font-semibold mt-0.5 ${labelColor}`}>
          {sublabel ?? " "}
        </Text>
        {wrapFromPrev ? (
          <View className="absolute top-0 bottom-0 start-0.5 justify-center">
            <DirectionalIcon name="chevron-back" size={10} color="white" />
          </View>
        ) : null}
        {wrapToNext ? (
          <View className="absolute top-0 bottom-0 end-0.5 justify-center">
            <DirectionalIcon name="chevron-forward" size={10} color="white" />
          </View>
        ) : null}
        {showMenu ? (
          <PressableOpacity
            onPress={() => onMenu?.(entry)}
            disabled={menuLoading}
            hitSlop={10}
            className="absolute top-1 end-1 w-6 h-6 rounded-full items-center justify-center"
          >
            {menuLoading ? (
              <ActivityIndicator size="small" color={menuIconColor} />
            ) : (
              <Ionicons
                name="ellipsis-horizontal"
                size={16}
                color={menuIconColor}
              />
            )}
          </PressableOpacity>
        ) : null}
      </View>
    </PressableOpacity>
  );
});
