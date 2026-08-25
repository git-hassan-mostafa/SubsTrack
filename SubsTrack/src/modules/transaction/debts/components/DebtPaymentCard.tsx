import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { DebtPaymentItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";

interface Props {
  payment: DebtPaymentItem;
  // Offered through the row's 3-dot menu (same shape as DebtItemCard). Omit for
  // a read-only list — the menu then disappears.
  onVoid?: (payment: DebtPaymentItem) => void;
  // On a single-customer surface the name is redundant on every row; when true
  // the notes/label becomes the primary line instead of the customer name.
  hideCustomerName?: boolean;
}

export function DebtPaymentCard({ payment, onVoid, hideCustomerName }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const [menuOpen, setMenuOpen] = useState(false);

  const source = paymentSnapshotCurrency(payment, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const amountLabel = formatMoney(payment.amount, source, target);

  const actions: ActionMenuItem[] = [];
  if (onVoid) {
    actions.push({
      key: "remove",
      label: t("debts.remove"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => onVoid(payment),
    });
  }

  return (
    <>
    <EntityCard
      icon="cash-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {hideCustomerName
            ? payment.notes?.trim()
              ? payment.notes
              : t("debts.debt_payment")
            : payment.customerName}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {hideCustomerName
            ? ""
            : `${payment.notes?.trim() ? payment.notes : t("debts.debt_payment")} · `}
          {formatDate(payment.paidAt, locale)}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-green-600">
          {"- "}
          {amountLabel}
        </Text>
      </View>
    </EntityCard>

    <ActionMenu
      visible={menuOpen}
      // On the cross-customer history the customer name is what identifies
      // the row; on a single-customer surface it would only be noise.
      title={
        hideCustomerName
          ? payment.notes?.trim()
            ? payment.notes
            : t("debts.debt_payment")
          : payment.customerName
      }
      actions={actions}
      onDismiss={() => setMenuOpen(false)}
    />
    </>
  );
}
