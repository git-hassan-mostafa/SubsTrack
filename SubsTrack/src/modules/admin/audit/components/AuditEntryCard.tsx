import { memo, useMemo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "@/src/core/i18n";
import type { AuditAction, AuditEntry } from "@/src/core/types";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { buildAuditSummary } from "../utils/summary";
import { fieldContext, type AuditContextBase } from "../utils/valueDisplay";
import { AuditSummaryText } from "./AuditSummaryText";

const ACTION_STYLE: Record<
  AuditAction,
  { icon: keyof typeof Ionicons.glyphMap; color: string; tile: string }
> = {
  create: { icon: "add-outline", color: COLORS.success, tile: "bg-green-50" },
  update: {
    icon: "create-outline",
    color: COLORS.primary,
    tile: "bg-indigo-50",
  },
  delete: { icon: "trash-outline", color: COLORS.danger, tile: "bg-red-50" },
  void: { icon: "close-outline", color: COLORS.danger, tile: "bg-red-50" },
  restore: {
    icon: "refresh-outline",
    color: COLORS.warning,
    tile: "bg-amber-50",
  },
};

interface AuditEntryCardProps {
  entry: AuditEntry;
  base: AuditContextBase;
  showSubject?: boolean;
  onPress: () => void;
}

/** One row of the trail as a readable sentence over a muted timestamp. */
function AuditEntryCardComponent({
  entry,
  base,
  showSubject = true,
  onPress,
}: AuditEntryCardProps) {
  const style = ACTION_STYLE[entry.action];

  const parts = useMemo(
    () => buildAuditSummary(entry, fieldContext(base, entry), { showSubject }),
    [entry, base, showSubject],
  );

  return (
    <PressableOpacity
      onPress={onPress}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3 mb-2 flex-row items-start"
    >
      <View
        className={`w-9 h-9 rounded-xl items-center justify-center me-3 mt-0.5 ${style.tile}`}
      >
        <Ionicons name={style.icon} size={17} color={style.color} />
      </View>

      <View className="flex-1">
        <AuditSummaryText
          parts={parts}
          className="text-[14px] leading-5 text-gray-900"
          numberOfLines={3}
        />
        <Text className="text-[11px] text-gray-400 mt-1" numberOfLines={1}>
          {formatDateTimeShort(entry.occurredAt, i18n.language)}
        </Text>
      </View>
    </PressableOpacity>
  );
}

export const AuditEntryCard = memo(AuditEntryCardComponent);
