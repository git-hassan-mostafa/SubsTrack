import { useMemo } from "react";
import { BottomSheetSectionList } from "@gorhom/bottom-sheet";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { groupByMonth } from "@/src/shared/lib/monthSections";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { DebtItemCard } from "./DebtItemCard";
import { DebtPaymentCard } from "./DebtPaymentCard";

type Row =
  | { kind: "item"; item: DebtItem }
  | { kind: "payment"; payment: DebtPaymentItem };

interface Props {
  // The full branch dataset from the Debts slice (outstanding debts + every debt
  // payment). Merged and grouped here — this view never re-fetches.
  items: DebtItem[];
  payments: DebtPaymentItem[];
  onDismiss: () => void;
  // Optional row actions — the Debts tab wires these to the same
  // `useDebtRowActions` handlers the debtor modal and the customer panel use.
  // Omit them for a read-only list (the 3-dot menus then disappear).
  onPay?: (item: DebtItem) => void;
  onVoidItem?: (item: DebtItem) => void;
  onVoidPayment?: (payment: DebtPaymentItem) => void;
}

// The date every row is filed under: when it was RECORDED, never what it is
// about. A subscription debt's billing month can be years out, so grouping by it
// scattered today's entries across future sections.
function rowDate(row: Row): string {
  return row.kind === "item" ? row.item.createdAt : row.payment.paidAt;
}

// A branch-wide activity log: debts and debt payments merged into one
// newest-first list, bucketed into date sections (Today / This Week / This
// Month / <Month> <Year>) exactly like the Payments and Sales tabs. Each header
// shows the two sums side by side — debts added (red) and payments collected
// (green) — rather than one net figure that hides both.
// Opened from the clock icon on the Debts total card. Rows carry the same 3-dot
// actions as every other debt surface (pay a debt / remove a custom debt /
// remove a debt payment); the list is derived from the slice, so a mutation
// flows straight back into the open sheet.
export function DebtHistorySheet({
  items,
  payments,
  onDismiss,
  onPay,
  onVoidItem,
  onVoidPayment,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);

  // Merge both sources into one union list, newest-recorded first. groupByMonth
  // only buckets — the sort here stays the single source of order.
  const rows: Row[] = useMemo(() => {
    const merged: Row[] = [
      ...items.map((item) => ({ kind: "item", item }) as Row),
      ...payments.map((payment) => ({ kind: "payment", payment }) as Row),
    ];
    merged.sort((a, b) => {
      const x = rowDate(a);
      const y = rowDate(b);
      return x < y ? 1 : x > y ? -1 : 0;
    });
    return merged;
  }, [items, payments]);

  // Two independent sums per section — kept apart on purpose: a month that added
  // $300 of debt and collected $300 is NOT the same story as a quiet month, and
  // a single net figure tells both identically.
  const sections = useMemo(() => {
    const grouped = groupByMonth(rows, rowDate, t);
    return grouped.map((section) => {
      let debtsUsd = 0;
      let paymentsUsd = 0;
      for (const row of section.data) {
        if (row.kind === "item") {
          debtsUsd += row.item.remaining / row.item.ratePerUsdSnapshot;
        } else {
          paymentsUsd += row.payment.amount / row.payment.ratePerUsdSnapshot;
        }
      }
      return { ...section, debtsUsd, paymentsUsd };
    });
  }, [rows, t]);

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text
            fontWeight="Bold"
            className="text-lg text-gray-900"
            numberOfLines={1}
          >
            {t("debts.history_title")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </SheetDragArea>

        <BottomSheetSectionList
          sections={sections}
          keyExtractor={(r) =>
            r.kind === "item"
              ? `i-${r.item.category}-${r.item.id}`
              : `p-${r.payment.id}`
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 48,
            flexGrow: 1,
          }}
          renderSectionHeader={({ section }) => (
            <MonthSectionHeader
              title={section.title}
              count={section.data.length}
              first={section.key === sections[0]?.key}
              // Only the sides that actually moved are shown, so a
              // payments-only section doesn't print a meaningless "+$0.00".
              totals={[
                ...(section.debtsUsd > 0
                  ? [
                      {
                        text: `+${formatMoney(section.debtsUsd, null, target)}`,
                        className: "text-red-600",
                      },
                    ]
                  : []),
                ...(section.paymentsUsd > 0
                  ? [
                      {
                        text: `-${formatMoney(section.paymentsUsd, null, target)}`,
                        className: "text-green-600",
                      },
                    ]
                  : []),
              ]}
            />
          )}
          renderItem={({ item: row }) =>
            row.kind === "payment" ? (
              <DebtPaymentCard payment={row.payment} onVoid={onVoidPayment} />
            ) : (
              <DebtItemCard item={row.item} onPay={onPay} onVoid={onVoidItem} />
            )
          }
          ListEmptyComponent={
            <EmptyState
              message={t("debts.history_empty")}
              subMessage={t("debts.history_empty_hint")}
            />
          }
        />
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
