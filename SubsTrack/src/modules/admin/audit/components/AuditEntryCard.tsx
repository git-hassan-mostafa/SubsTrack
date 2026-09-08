import { memo, useMemo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AuditAction, AuditEntry } from "@/src/core/types";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { CardMeta } from "@/src/shared/components/CardText";
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
    <EntityCard
      icon={style.icon}
      iconColor={style.color}
      iconBgClassName={style.tile}
      onPress={onPress}
    >
      <View className="flex-1">
        <AuditSummaryText
          parts={parts}
          className="text-sm leading-5 text-gray-900"
          numberOfLines={3}
        />
        <CardMeta className="mt-1" numberOfLines={1}>
          {formatDateTimeShort(entry.occurredAt)}
        </CardMeta>
      </View>
    </EntityCard>
  );
}

export const AuditEntryCard = memo(AuditEntryCardComponent);
