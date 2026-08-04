import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "@/src/core/i18n";
import type { AuditAction, AuditEntry } from "@/src/core/types";
import { formatDateTime } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { actionLabel, fieldLabel, tableLabel } from "../utils/format";

// Colour + icon per action, so the list scans by shape before you read it.
// `bg` is a Tailwind class (mirrors DebtItemCard) — there is no dangerLight token.
const ACTION_STYLE: Record<
  AuditAction,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  create: { icon: "add-outline", color: COLORS.success, bg: "bg-green-50" },
  update: { icon: "create-outline", color: COLORS.primary, bg: "bg-indigo-50" },
  delete: { icon: "trash-outline", color: COLORS.danger, bg: "bg-red-50" },
  void: { icon: "close-outline", color: COLORS.danger, bg: "bg-red-50" },
  restore: { icon: "refresh-outline", color: COLORS.warning, bg: "bg-amber-50" },
};

interface AuditEntryCardProps {
  entry: AuditEntry;
  onPress: () => void;
}

export function AuditEntryCard({ entry, onPress }: AuditEntryCardProps) {
  const { t } = useTranslation();
  const style = ACTION_STYLE[entry.action];

  // The changed field names, so the row says WHAT moved without being tapped.
  // Capped at three — a long list would push the row to two lines for no gain.
  const fields = entry.changes.slice(0, 3).map((c) => fieldLabel(t, c.field));
  const extra = entry.changes.length - fields.length;

  return (
    <PressableOpacity
      onPress={onPress}
      className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 mb-2 flex-row items-center gap-3"
    >
      <View className={`w-10 h-10 rounded-xl items-center justify-center ${style.bg}`}>
        <Ionicons name={style.icon} size={18} color={style.color} />
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
            {actionLabel(t, entry.action)} · {tableLabel(t, entry.table)}
          </Text>
        </View>

        {entry.label ? (
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {entry.label}
          </Text>
        ) : null}

        {fields.length > 0 ? (
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {fields.join(", ")}
            {extra > 0 ? ` +${extra}` : ""}
          </Text>
        ) : null}

        <Text className="text-xs text-gray-400 mt-1" numberOfLines={1}>
          {entry.actorUsername ?? t("audit.unknown_actor")} ·{" "}
          {formatDateTime(entry.occurredAt, i18n.language)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={COLORS.gray300} />
    </PressableOpacity>
  );
}
