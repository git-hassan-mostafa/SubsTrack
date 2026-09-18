import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  CardAmount,
  CardChips,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import { COLORS } from "@/src/shared/constants";
import type { AllocationLine, OpenItem } from "@/src/core/types";
import { daysLate, formatDate } from "@/src/core/utils/date";
import { keyOf } from "../utils/waterfall";

interface Props {
  items: OpenItem[];
  lines: AllocationLine[];
  excluded: ReadonlySet<string>;
  onToggle: (item: OpenItem) => void;
  money: (value: number) => string;
  remainingAfter: number;
}

/**
 * The split preview: what this money will do, in the order it will do it.
 *
 * The whole point is that the queue is VISIBLE — the rows are drawn in the
 * waterfall's own order and each carries its position, its due date and how far
 * behind it is, so staff can see WHY the oldest bill got the money instead of
 * having to trust it. Untick a row and the numbers below it close up, which is
 * the rule "the money moves down to the next bill" shown rather than explained.
 */
export function AllocationPreview({
  items,
  lines,
  excluded,
  onToggle,
  money,
  remainingAfter,
}: Props) {
  const { t } = useTranslation();

  const byKey = useMemo(
    () => new Map(lines.map((l) => [keyOf(l.item), l])),
    [lines],
  );

  const positions = useMemo(() => {
    const out = new Map<string, number>();
    let n = 0;
    for (const item of items) {
      const key = keyOf(item);
      if (!excluded.has(key)) out.set(key, ++n);
    }
    return out;
  }, [items, excluded]);

  return (
    <View>
      <Text
        fontWeight="SemiBold"
        className="mb-2 text-xs uppercase tracking-wide text-gray-500"
      >
        {t("ledger.this_pays")}
      </Text>
      {items.length > 1 ? (
        <Text className="-mt-1 mb-2 text-[11px] text-gray-400">
          {t("ledger.skip_bill_hint")}
        </Text>
      ) : null}

      <View>
        {items.map((item) => {
          const key = keyOf(item);
          const line = byKey.get(key);
          const skipped = excluded.has(key);
          const late = daysLate(item.dueDate);
          const status = skipped
            ? t("ledger.skipped_bill")
            : !line
              ? null
              : line.settles
                ? t("ledger.pays_in_full")
                : t("ledger.leaves_owing", {
                    amount: money(item.balance - line.amount),
                  });
          return (
            <EntityCard
              key={key}
              onPress={() => onToggle(item)}
              dimmed={skipped}
              renderIcon={
                <QueueBadge
                  position={positions.get(key)}
                  skipped={skipped}
                  funded={!!line}
                />
              }
            >
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-start justify-between gap-2">
                  <CardTitle className="flex-1" numberOfLines={1}>
                    {item.label}
                  </CardTitle>
                  <CardAmount tone={skipped ? "muted" : "default"}>
                    {money(line?.amount ?? 0)}
                  </CardAmount>
                </View>

                <CardSubtitle numberOfLines={1}>
                  {t("ledger.due_on", { date: formatDate(item.dueDate) })}
                  {late > 0
                    ? ` · ${t("ledger.days_late", { count: late })}`
                    : ""}
                  {!line && !skipped
                    ? ` · ${t("ledger.amount_owed", { amount: money(item.balance) })}`
                    : ""}
                </CardSubtitle>

                {status ? (
                  <CardChips>
                    <Chip text={status} tone={statusTone(skipped, line)} />
                  </CardChips>
                ) : null}
              </View>
            </EntityCard>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between border-t border-gray-100 pt-2.5">
        <Text className="text-sm text-gray-600">
          {t("ledger.still_owed_after")}
        </Text>
        <Text fontWeight="Bold" className="text-sm text-gray-900">
          {money(Math.max(0, remainingAfter))}
        </Text>
      </View>
    </View>
  );
}

interface BadgeProps {
  position?: number;
  skipped: boolean;
  funded: boolean;
}

/** The number IS the queue: filled once money reaches the bill, hollow before. */
function QueueBadge({ position, skipped, funded }: BadgeProps) {
  if (skipped) {
    return (
      <View className="h-8 w-8 items-center justify-center rounded-full bg-gray-200">
        <Ionicons name="close" size={16} color={COLORS.gray500} />
      </View>
    );
  }
  return (
    <View
      className={`h-8 w-8 items-center justify-center rounded-full ${
        funded ? "bg-primary" : "border border-gray-300"
      }`}
    >
      <Text
        fontWeight="Bold"
        className={`text-xs ${funded ? "text-white" : "text-gray-400"}`}
      >
        {position}
      </Text>
    </View>
  );
}

/** Emerald = closed, amber = part paid, gray = nothing reached it. */
function statusTone(skipped: boolean, line?: AllocationLine): ChipTone {
  if (skipped || !line) return "gray";
  return line.settles ? "emerald" : "amber";
}
