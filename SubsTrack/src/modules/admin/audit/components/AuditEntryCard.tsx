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
 * One row of the trail, in two lines: WHAT record (type + whose it is) with the
 * action as a colour, then WHO did it and when.
 *
 * Deliberately not a summary of the change itself — the field names used to be
 * listed here as chips, which made every row three or four lines tall and still
 * said less than one tap does. The count alone tells the reader whether the entry
 * is worth opening; the sheet holds the detail.
 */
export function AuditEntryCard({ entry, onPress }: AuditEntryCardProps) {
  const { t } = useTranslation();
  const style = ACTION_STYLE[entry.action];

  const type = tableLabel(t, entry.table);
  // Whose record it is (a customer), frozen at write time. Absent on records that
  // belong to nobody (a plan, a setting) and on entries written before it existed.
  const subject = entry.subject;

  return (
    <PressableOpacity
      onPress={onPress}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3 mb-2 flex-row items-center"
    >
      <View
        className={`w-9 h-9 rounded-xl items-center justify-center me-3 ${style.tile}`}
      >
        <Ionicons name={style.icon} size={17} color={style.color} />
        <Text
          fontWeight="Regular"
          className={`text-[7px] uppercase tracking-wide ${style.pillText}`}
        >
          {actionLabel(t, entry.action)}
        </Text>
      </View>

      <View className="flex-1">
        {/* Record type, then the customer it belongs to — the customer reads as the
            subject without competing with the type for the eye. */}
        <View className="flex-row items-center">
          <Text className="flex-1 text-[15px] text-gray-900" numberOfLines={1}>
            {type}
          </Text>
          {!!subject && (
            <View
              className={`flex-row items-center rounded-full px-2 py-0.5 ms-2 bg-indigo-50`}
            >
              <Ionicons
                name="person-outline"
                className="mr-1.5"
                size={11}
                color={COLORS.gray400}
              />
              <Text
                fontWeight="SemiBold"
                className={`text-[10px] uppercase tracking-wide text-gray-600`}
              >
                {subject}
              </Text>
            </View>
          )}
        </View>

        {/* Who + when + what moved, on one muted line — the evidence a dispute
            turns on, without taking a line each. */}
        <View className="flex-row items-center">
          <Ionicons name="person" className="text-gray-600 mr-1.5" size={11} />
          <Text className="text-[11px] text-gray-500" numberOfLines={1}>
            {entry.actorUsername ?? t("audit.unknown_actor")}
          </Text>
          <Text className="text-[11px] text-gray-300 mx-1.5">·</Text>
          <Text className="text-[11px] text-gray-400" numberOfLines={1}>
            {formatDateTimeShort(entry.occurredAt, i18n.language)}
          </Text>
        </View>
      </View>
    </PressableOpacity>
  );
}
