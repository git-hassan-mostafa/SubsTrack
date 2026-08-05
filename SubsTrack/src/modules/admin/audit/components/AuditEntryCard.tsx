import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "@/src/core/i18n";
import type { AuditAction, AuditEntry } from "@/src/core/types";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import {
  actionLabel,
  fieldLabel,
  recordLabel,
  tableLabel,
} from "../utils/format";

// Colour + icon per action, so the list scans by shape before you read it.
// Tailwind classes (mirrors DebtItemCard) — there are no light danger/indigo tokens.
const ACTION_STYLE: Record<
  AuditAction,
  {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    tile: string;
    pill: string;
    pillText: string;
  }
> = {
  create: {
    icon: "add-outline",
    color: COLORS.success,
    tile: "bg-green-50",
    pill: "bg-green-50",
    pillText: "text-green-700",
  },
  update: {
    icon: "create-outline",
    color: COLORS.primary,
    tile: "bg-indigo-50",
    pill: "bg-indigo-50",
    pillText: "text-indigo-700",
  },
  delete: {
    icon: "trash-outline",
    color: COLORS.danger,
    tile: "bg-red-50",
    pill: "bg-red-50",
    pillText: "text-red-700",
  },
  void: {
    icon: "close-outline",
    color: COLORS.danger,
    tile: "bg-red-50",
    pill: "bg-red-50",
    pillText: "text-red-700",
  },
  restore: {
    icon: "refresh-outline",
    color: COLORS.warning,
    tile: "bg-amber-50",
    pill: "bg-amber-50",
    pillText: "text-amber-700",
  },
};

interface AuditEntryCardProps {
  entry: AuditEntry;
  onPress: () => void;
}

/**
 * One row of the trail: what kind of record, what happened to it, which fields
 * moved, and who did it — in that reading order, so a long log scans top-down.
 */
export function AuditEntryCard({ entry, onPress }: AuditEntryCardProps) {
  const { t } = useTranslation();
  const style = ACTION_STYLE[entry.action];

  // The changed field names, so the row says WHAT moved without being tapped.
  // Capped at three — a longer list turns the chip row into a paragraph.
  const fields = entry.changes.slice(0, 3).map((c) => fieldLabel(t, c.field));
  const extra = entry.changes.length - fields.length;
  // Same one-liner the sheet shows, so the list and the detail never disagree.
  const label = recordLabel(t, entry);

  return (
    <PressableOpacity
      onPress={onPress}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 mb-2.5 flex-row items-start"
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center me-3 ${style.tile}`}
      >
        <Ionicons name={style.icon} size={18} color={style.color} />
      </View>

      <View className="flex-1">
        {/* What kind of record + what happened to it (the action as a colour, not prose). */}
        <View className="flex-row items-center">
          <Text
            fontWeight="SemiBold"
            className="flex-1 text-[15px] text-gray-900 pe-2"
            numberOfLines={1}
          >
            {tableLabel(t, entry.table)}
          </Text>
          <View className={`rounded-full px-2 py-0.5 ${style.pill}`}>
            <Text
              fontWeight="SemiBold"
              className={`text-[10px] uppercase tracking-wide ${style.pillText}`}
            >
              {actionLabel(t, entry.action)}
            </Text>
          </View>
        </View>

        {label ? (
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {label}
          </Text>
        ) : null}

        {/* Chips instead of a comma list — the eye picks one field out at a glance. */}
        {fields.length > 0 ? (
          <View className="flex-row flex-wrap items-center gap-1 mt-1.5">
            {fields.map((f) => (
              <View
                key={f}
                className="bg-gray-50 border border-gray-100 rounded-md px-1.5 py-0.5"
              >
                <Text className="text-[10px] text-gray-600" numberOfLines={1}>
                  {f}
                </Text>
              </View>
            ))}
            {extra > 0 ? (
              <Text className="text-[10px] text-gray-400">{`+${extra}`}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Who + when, split off by a hairline: the evidence a dispute turns on. */}
        <View className="flex-row items-center mt-2">
          <Ionicons name="person-outline" size={11} color={COLORS.gray400} />
          <Text
            className="flex-1 text-[11px] text-gray-500 ms-1"
            numberOfLines={1}
          >
            {entry.actorUsername ?? t("audit.unknown_actor")}
          </Text>
          <Text className="text-[11px] text-gray-400 ms-2" numberOfLines={1}>
            {formatDateTimeShort(entry.occurredAt, i18n.language)}
          </Text>
        </View>
      </View>
    </PressableOpacity>
  );
}
