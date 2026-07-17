import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { DebtItem, DebtPaymentItem } from "@/src/core/types";
import { DebtItemCard } from "./DebtItemCard";
import { DebtPaymentCard } from "./DebtPaymentCard";

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
// partial sales, custom) above the debt payments recorded against them, always
// with `hideCustomerName` (rendered on a single-customer surface). Purely
// presentational — the container owns the title / net header. Reused by
// CustomerDebtsPanel (read-only) and DebtorDetailSheet (interactive).
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
      {items.length > 0 ? (
        <>
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            {t("debts.section_debts_history")}
          </Text>
          {items.map((item) => (
            <DebtItemCard
              key={`${item.category}-${item.id}`}
              item={item}
              hideCustomerName
              onPay={onPay}
              onVoid={onVoidItem}
            />
          ))}
        </>
      ) : null}

      {payments.length > 0 ? (
        <>
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 mt-2">
            {t("debts.section_payments_history")}
          </Text>
          {payments.map((p) => (
            <DebtPaymentCard
              key={p.id}
              payment={p}
              hideCustomerName
              onVoid={onVoidPayment}
            />
          ))}
        </>
      ) : null}
    </>
  );
}
