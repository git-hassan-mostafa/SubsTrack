import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
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
    <View className="gap-2">
      <Text
        fontWeight="SemiBold"
        className="text-xs uppercase tracking-wide text-gray-500"
      >
        {t("ledger.this_pays")}
      </Text>
      <Text className="text-xs leading-4 text-gray-500">
        {t("ledger.waterfall_hint")}
      </Text>

      {items.map((item) => {
        const key = keyOf(item);
        const line = byKey.get(key);
        const skipped = excluded.has(key);
        const position = positions.get(key);
        const late = daysLate(item.dueDate);
        return (
          <PressableOpacity
            key={key}
            onPress={() => onToggle(item)}
            className={`flex-row items-center gap-3 rounded-xl border px-3 py-2.5 ${
              skipped ? "border-gray-200 bg-gray-50" : "border-gray-200"
            }`}
          >
            {/* The number IS the order — filled once money reaches the bill,
                hollow while it is still waiting behind the ones above it. */}
            {skipped ? (
              <View className="h-7 w-7 items-center justify-center rounded-full bg-gray-200">
                <Ionicons name="close" size={14} color={COLORS.gray500} />
              </View>
            ) : (
              <View
                className={`h-7 w-7 items-center justify-center rounded-full ${
                  line ? "bg-primary" : "border border-gray-300"
                }`}
              >
                <Text
                  fontWeight="Bold"
                  className={`text-xs ${line ? "text-white" : "text-gray-400"}`}
                >
                  {position}
                </Text>
              </View>
            )}

            <View className="flex-1">
              <Text
                className={`text-sm ${
                  skipped ? "text-gray-400 line-through" : "text-gray-900"
                }`}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              <Text className="text-xs text-gray-500" numberOfLines={1}>
                {t("ledger.due_on", {
                  date: formatDate(item.dueDate),
                })}
                {late > 0 ? ` · ${t("ledger.days_late", { count: late })}` : ""}
                {/* Only where the row is not settled by this money: then the
                    status on the right does not already say what is left. */}
                {!line
                  ? ` · ${t("ledger.amount_owed", { amount: money(item.balance) })}`
                  : ""}
              </Text>
            </View>

            <View className="ms-2 items-end">
              <Text
                fontWeight={line ? "Bold" : "Regular"}
                className={`text-sm ${line ? "text-gray-900" : "text-gray-300"}`}
              >
                {line ? money(line.amount) : "—"}
              </Text>
              <Text className={`mt-0.5 text-[11px] ${statusClass(skipped, line)}`}>
                {skipped
                  ? t("ledger.skipped_bill")
                  : line?.settles
                    ? t("ledger.pays_in_full")
                    : line
                      ? t("ledger.leaves_owing", {
                          amount: money(item.balance - line.amount),
                        })
                      : t("ledger.not_covered")}
              </Text>
            </View>
          </PressableOpacity>
        );
      })}

      <View className="flex-row items-center justify-between border-t border-gray-200 pt-2">
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

/** Green = closed, amber = part paid, grey = nothing reached it. */
function statusClass(skipped: boolean, line?: AllocationLine): string {
  if (skipped || !line) return "text-gray-400";
  return line.settles ? "text-green-700" : "text-amber-700";
}
