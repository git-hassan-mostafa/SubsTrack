import { useMemo } from "react";
import { View } from "react-native";
import { BottomSheetSectionList } from "@gorhom/bottom-sheet";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { groupByMonth } from "@/src/shared/lib/monthSections";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
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
}

// A read-only, branch-wide activity log: debts and debt payments merged into one
// newest-first list, bucketed into month sections (Today / This Week / This
// Month / <Month> <Year>) exactly like the Payments and Sales tabs. Each month
// header shows the NET change for that month (debts add, payments subtract).
// Opened from the clock icon on the Debts total card.
export function DebtHistorySheet({ items, payments, onDismiss }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const target = findCurrency(currencies, displayCurrencyId);

  // Merge both sources into one union list, then sort newest-first by date
  // (DebtItem.date / DebtPayment.paidAt). groupByMonth only buckets — the sort
  // here stays the single source of order.
  const rows: Row[] = useMemo(() => {
    const merged: { row: Row; date: string }[] = [
      ...items.map((item) => ({
        row: { kind: "item", item } as Row,
        date: item.date,
      })),
      ...payments.map((payment) => ({
        row: { kind: "payment", payment } as Row,
        date: payment.paidAt,
      })),
    ];
    merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return merged.map((entry) => entry.row);
  }, [items, payments]);

  // Net USD per month: a debt adds, a payment subtracts.
  const sections = useMemo(
    () =>
      groupByMonth(
        rows,
        (r) => (r.kind === "item" ? r.item.date : r.payment.paidAt),
        t,
        (r) =>
          r.kind === "item"
            ? r.item.remaining / r.item.ratePerUsdSnapshot
            : -(r.payment.amount / r.payment.ratePerUsdSnapshot),
      ),
    [rows, t],
  );

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
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
        </View>

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
              total={formatMoney(section.totalUsd ?? 0, null, target)}
            />
          )}
          renderItem={({ item: row }) =>
            row.kind === "payment" ? (
              <DebtPaymentCard payment={row.payment} />
            ) : (
              <DebtItemCard item={row.item} />
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
