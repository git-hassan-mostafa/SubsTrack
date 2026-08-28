import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import type { DebtCategory, DebtItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";

interface Props {
  item: DebtItem;
  // Records a debt payment equal to this row's remaining amount, paying it off.
  // Available for every category (a debt payment is tied only to the customer).
  onPay?: (item: DebtItem) => void;
  // Corrects the record behind a DERIVED row (a month payment or a sale) so it
  // owes nothing — no debt payment is recorded. A custom debt has no such record,
  // so the action is hidden there.
  onComplete?: (item: DebtItem) => void;
  // Only custom debts can be voided from here (months/sales are derived — void
  // the underlying payment/sale in their own tab). Omit for non-custom rows.
  onVoid?: (item: DebtItem) => void;
  // On a single-customer surface the name is redundant on every row; when true
  // the label becomes the primary line instead of the customer name.
  hideCustomerName?: boolean;
  // Opens the record behind a DERIVED row — the month receipt for a partial
  // payment, the sale receipt for a partial sale. A custom debt has no such
  // record, so tapping it does nothing.
  onOpen?: (item: DebtItem) => void;
  // True while this row's record is being fetched (the card shows a spinner).
  loading?: boolean;
}

const CATEGORY_STYLE: Record<
  DebtCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; badge: string }
> = {
  months: { icon: "calendar-outline", color: COLORS.danger, bg: "bg-red-50", badge: "bg-red-50 text-red-700" },
  sales: { icon: "receipt-outline", color: COLORS.danger, bg: "bg-red-50", badge: "bg-red-50 text-red-700" },
  services: { icon: "construct-outline", color: COLORS.danger, bg: "bg-red-50", badge: "bg-red-50 text-red-700" },
  custom: { icon: "document-text-outline", color: COLORS.danger, bg: "bg-red-50", badge: "bg-red-50 text-red-700" },
};

export function DebtItemCard({
  item,
  onPay,
  onComplete,
  onVoid,
  hideCustomerName,
  onOpen,
  loading = false,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const amountLabel = formatMoney(item.remaining, source, target);
  // "20/50 $" — what was collected out of what was owed. Only a derived row has
  // a record behind it to report; a custom debt's amount IS the debt.
  const paidFraction =
    item.amountPaid != null && item.amountDue != null
      ? formatPaidFraction(item.amountPaid, item.amountDue, source, source)
      : null;
  const style = CATEGORY_STYLE[item.category];
  const canVoid = item.category === "custom" && !!onVoid;
  // Only a derived row has a record to correct; a custom debt is the record.
  const canComplete = item.sourceType !== "custom_debt" && !!onComplete;

  const actions: ActionMenuItem[] = [];
  if (onPay) {
    actions.push({
      key: "pay",
      label: t("debts.pay"),
      icon: "cash-outline",
      onPress: () => onPay(item),
    });
  }
  if (canComplete) {
    actions.push({
      key: "complete",
      label: t("common.complete"),
      icon: "checkmark-done-outline",
      caption: t("common.complete_caption"),
      onPress: () => onComplete?.(item),
    });
  }
  if (canVoid) {
    actions.push({
      key: "remove",
      label: t("debts.remove"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => onVoid?.(item),
    });
  }

  return (
    <>
    <EntityCard
      icon={style.icon}
      iconColor={style.color}
      iconBgClassName={style.bg}
      onPress={
        onOpen && item.sourceType !== "custom_debt"
          ? () => onOpen(item)
          : undefined
      }
      onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
      menuLoading={loading}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {hideCustomerName ? item.label : item.customerName}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {hideCustomerName ? "" : `${item.label} · `}
          {formatDate(item.date, locale)}
          {/* Collected out of owed — says WHY the row owes what it owes. Sits
              here, not under the amount, so the card keeps its two-line height. */}
          {paidFraction ? ` · ${paidFraction}` : ""}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {amountLabel}
        </Text>
        <Text
          className={`text-[10px] font-semibold uppercase tracking-wide mt-1 px-1.5 py-0.5 rounded ${style.badge}`}
        >
          {t(`debts.category_${item.category}`)}
        </Text>
      </View>
    </EntityCard>

    <ActionMenu
      visible={menuOpen}
      title={item.customerName}
      actions={actions}
      onDismiss={() => setMenuOpen(false)}
    />
    </>
  );
}
