import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import type { AllocationLine, OpenItem } from "@/src/core/types";
import { daysLate, formatDate } from "@/src/core/utils/date";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { keyOf } from "../utils/waterfall";

interface Props {
  /** Currency-scoped and ALREADY in waterfall order — a row's place IS its number. */
  items: OpenItem[];
  /** What the money actually does, from the same order. */
  lines: AllocationLine[];
  excluded: ReadonlySet<string>;
  onToggle: (item: OpenItem) => void;
  /** The sheet's formatter — every row here shares one currency. */
  money: (value: number) => string;
  /** Still owed once this hand-over is saved. */
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
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const byKey = useMemo(
    () => new Map(lines.map((l) => [keyOf(l.item), l])),
    [lines],
  );

  // Queue position per row. Skipped rows leave the queue entirely, so the
  // numbering re-flows instead of leaving a gap.
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
      <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("ledger.this_pays")}
      </Text>
      <Text className="text-xs leading-4 text-slate-500">
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
              skipped ? "border-slate-200 bg-slate-50" : "border-slate-200"
            }`}
          >
            {/* The number IS the order — filled once money reaches the bill,
                hollow while it is still waiting behind the ones above it. */}
            {skipped ? (
              <View className="h-7 w-7 items-center justify-center rounded-full bg-slate-200">
                <Ionicons name="close" size={14} color={COLORS.gray500} />
              </View>
            ) : (
              <View
                className={`h-7 w-7 items-center justify-center rounded-full ${
                  line ? "bg-primary" : "border border-slate-300"
                }`}
              >
                <Text
                  fontWeight="Bold"
                  className={`text-xs ${line ? "text-white" : "text-slate-400"}`}
                >
                  {position}
                </Text>
              </View>
            )}

            <View className="flex-1">
              <Text
                className={`text-sm ${
                  skipped ? "text-slate-400 line-through" : "text-slate-900"
                }`}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              <Text className="text-xs text-slate-500" numberOfLines={1}>
                {t("ledger.due_on", {
                  date: formatDate(item.dueDate, locale),
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
                className={`text-sm ${line ? "text-slate-900" : "text-slate-300"}`}
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

      <View className="flex-row items-center justify-between border-t border-slate-200 pt-2">
        <Text className="text-sm text-slate-600">
          {t("ledger.still_owed_after")}
        </Text>
        <Text fontWeight="Bold" className="text-sm text-slate-900">
          {money(Math.max(0, remainingAfter))}
        </Text>
      </View>
    </View>
  );
}

/** Green = closed, amber = part paid, grey = nothing reached it. */
function statusClass(skipped: boolean, line?: AllocationLine): string {
  if (skipped || !line) return "text-slate-400";
  return line.settles ? "text-green-700" : "text-amber-700";
}
