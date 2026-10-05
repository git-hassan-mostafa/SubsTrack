import { memo } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import {
  CELL_BADGE_KEYS,
  cellBadge,
  showsPartialRing,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import {
  isSelectableMonth,
  monthCellTone,
  type MonthCellTone,
} from "@shared/modules/customer/customer-payments/utils/monthView";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import type { MonthEntry } from "@shared/core/types";

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

const TONE_LOOK: Record<
  MonthCellTone,
  { bg: string; text: string; icon: string }
> = {
  paid: { bg: "bg-green-500", text: "text-white", icon: COLORS.white },
  paid_irregular: { bg: "bg-yellow-400", text: "text-white", icon: COLORS.white },
  unpaid: { bg: "bg-red-500", text: "text-white", icon: COLORS.white },
  unpaid_irregular: { bg: "bg-gray-200", text: "text-gray-400", icon: COLORS.gray500 },
  current_unpaid: {
    bg: "bg-red-100 border-2 border-red-500",
    text: "text-red-600",
    icon: COLORS.danger,
  },
  future: { bg: "bg-gray-100", text: "text-gray-400", icon: COLORS.gray500 },
  before_start: { bg: "bg-gray-100", text: "text-gray-300", icon: COLORS.gray500 },
  skipped: { bg: "bg-gray-400", text: "text-white", icon: COLORS.white },
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
  const selectable = isSelectableMonth(entry);
  const look = TONE_LOOK[monthCellTone(entry, isRegular)];
  const containerBg = showsPartialRing(entry)
    ? `${look.bg} border-2 border-amber-500`
    : look.bg;
  const labelColor = look.text;
  const showMenu = !selectionMode && !!onMenu && selectable;
  const menuIconColor = look.icon;

  const badge = cellBadge(entry);
  const sublabel = badge
    ? badge === "this_month"
      ? t(CELL_BADGE_KEYS[badge]).toUpperCase()
      : t(CELL_BADGE_KEYS[badge])
    : null;

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
        <Text
          fontWeight="SemiBold"
          className={`text-[8px] mt-0.5 ${labelColor}`}
        >
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
