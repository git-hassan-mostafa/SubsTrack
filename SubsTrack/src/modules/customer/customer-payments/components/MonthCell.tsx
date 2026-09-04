import { memo } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
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
  selectionMode?: boolean;
  selected?: boolean;
  onToggle?: (entry: MonthEntry) => void;
  onLongPress?: (entry: MonthEntry) => void;
}

const regularBgColor: Record<MonthStatus, string> = {
  paid: "bg-green-500",
  unpaid: "bg-red-500",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
  skipped: "bg-slate-400",
};

const nonRegularBgColor: Record<MonthStatus, string> = {
  paid: "bg-yellow-400",
  unpaid: "bg-gray-200",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
  skipped: "bg-slate-400",
};

const regularTextColor: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-white",
  future: "text-gray-400",
  before_start: "text-gray-300",
  skipped: "text-white",
};

const nonRegularTextColor: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-gray-400",
  future: "text-gray-400",
  before_start: "text-gray-300",
  skipped: "text-white",
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
  selectionMode = false,
  selected = false,
  onToggle,
  onLongPress,
}: Props) {
  const { t } = useTranslation();
  const { year: cy, month: cm } = getCurrentYearMonth();
  const isCurrentMonth = entry.year === cy && entry.month === cm;

  const selectable = entry.status !== "before_start";

  const isPartial = entry.status === "paid" && entry.balance > 0;
  const showPartialRing = isPartial && !entry.isGroupSecondary;

  const bgColor = isRegular ? regularBgColor : nonRegularBgColor;
  const textColor = isRegular ? regularTextColor : nonRegularTextColor;

  const containerBg =
    isRegular && isCurrentMonth && entry.status === "unpaid"
      ? "bg-red-100 border-2 border-red-500"
      : showPartialRing
        ? `${bgColor.paid} border-2 border-amber-500`
        : bgColor[entry.status];

  const labelColor =
    isRegular && isCurrentMonth && entry.status === "unpaid"
      ? "text-red-600"
      : textColor[entry.status];

  const showMenu =
    !selectionMode && !!onMenu && entry.status !== "before_start";

  const usesWhiteText =
    entry.status === "paid" ||
    entry.status === "skipped" ||
    (isRegular && entry.status === "unpaid");
  const menuIconColor =
    isRegular && isCurrentMonth && entry.status === "unpaid"
      ? COLORS.danger
      : usesWhiteText
        ? COLORS.white
        : COLORS.gray500;

  const sublabel = (() => {
    if (entry.status === "paid" && entry.isGroupSecondary)
      return t("payments.included_label");
    if (isPartial) return t("payments.partial_badge");
    if (entry.status === "paid") return t("common.paid");
    if (entry.status === "skipped") return t("payments.skip.skipped_label");
    if (isCurrentMonth) return t("payments.this_month").toUpperCase();
    return null;
  })();

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

  const ringClass = selectionMode && selected ? "border-2 border-primary" : "";

  function handlePress() {
    if (selectionMode) {
      if (selectable) onToggle?.(entry);
      return;
    }
    onPress(entry);
  }

  return (
    <PressableOpacity
      onPress={handlePress}
      onLongPress={
        !selectionMode && selectable ? () => onLongPress?.(entry) : undefined
      }
      delayLongPress={250}
      className={`w-1/4 aspect-square ${padClass}`}
    >
      <View
        className={`${roundClass} ${ringClass} items-center justify-center flex-1 w-full ${containerBg}`}
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
        {selectionMode && selectable ? (
          <View className="absolute top-1 end-1">
            {selected ? (
              <View className="w-5 h-5 rounded-full items-center justify-center bg-primary">
                <Ionicons name="checkmark" size={13} color={COLORS.white} />
              </View>
            ) : (
              <View className="w-5 h-5 rounded-full border-2 border-gray-400 bg-white/70" />
            )}
          </View>
        ) : null}
      </View>
    </PressableOpacity>
  );
});
