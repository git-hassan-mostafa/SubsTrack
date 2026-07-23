import { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { DebtItemCard } from "./DebtItemCard";
import { DebtPaymentCard } from "./DebtPaymentCard";

type Row =
  | { kind: "item"; item: DebtItem; date: string }
  | { kind: "payment"; payment: DebtPaymentItem; date: string };

interface Props {
  items: DebtItem[];
  payments: DebtPaymentItem[];
  loading?: boolean;
  // Message shown when there is nothing to list. Defaults to the customer-panel copy.
  emptyMessage?: string;
  // Optional row actions. Omit all three for a read-only list (no menus) — that's
  // how the customer-detail panel uses it; the debtor modal wires them up.
  onPay?: (item: DebtItem) => void;
  onVoidItem?: (item: DebtItem) => void;
  onVoidPayment?: (payment: DebtPaymentItem) => void;
}

// The shared debt-list body: a customer's outstanding debts (partial months,
// partial sales, custom) and the debt payments recorded against them, merged
// into one newest-first list ordered by date (DebtItem.date / DebtPayment.paidAt)
// — the same interleaving as DebtHistorySheet. Always `hideCustomerName`
// (rendered on a single-customer surface). Purely presentational — the container
// owns the title / net header. Reused by CustomerDebtsPanel (read-only) and
// DebtorDetailSheet (interactive).
export function DebtList({
  items,
  payments,
  loading = false,
  emptyMessage,
  onPay,
  onVoidItem,
  onVoidPayment,
}: Props) {
  const { t } = useTranslation();
  const isEmpty = items.length === 0 && payments.length === 0;

  const rows: Row[] = useMemo(() => {
    const merged: Row[] = [
      ...items.map((item) => ({ kind: "item", item, date: item.date }) as Row),
      ...payments.map(
        (payment) => ({ kind: "payment", payment, date: payment.paidAt }) as Row,
      ),
    ];
    // Newest-first, matching DebtHistorySheet and the Payments/Sales tabs.
    merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return merged;
  }, [items, payments]);

  if (loading && isEmpty) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View className="py-6 items-center">
        <Text className="text-sm text-gray-400">
          {emptyMessage ?? t("debts.no_transactions_for_customer")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {rows.map((row) =>
        row.kind === "item" ? (
          <DebtItemCard
            key={`i-${row.item.category}-${row.item.id}`}
            item={row.item}
            hideCustomerName
            onPay={onPay}
            onVoid={onVoidItem}
          />
        ) : (
          <DebtPaymentCard
            key={`p-${row.payment.id}`}
            payment={row.payment}
            hideCustomerName
            onVoid={onVoidPayment}
          />
        ),
      )}
    </>
  );
}
