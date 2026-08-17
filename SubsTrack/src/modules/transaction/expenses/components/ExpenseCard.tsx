import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import type { ExpenseItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";
import { expenseCategoryIcon, expenseCategoryLabelKey } from "../utils/expenseCategories";

interface Props {
  item: ExpenseItem;
  // Manual rows only (item.canVoid). A derived stock cost has no row to void —
  // it is corrected with a stock adjustment.
  onVoid?: (item: ExpenseItem) => void;
  // Opens the product behind a derived stock row.
  onOpenProduct?: (productId: string) => void;
}

export function ExpenseCard({ item, onVoid, onOpenProduct }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const [menuOpen, setMenuOpen] = useState(false);

  const source = paymentSnapshotCurrency(item, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  // A leading minus, like the dashboard's money-out chip: every figure on this
  // screen is cash leaving, and it must never read like income at a glance.
  const amountLabel = `−${formatMoney(item.amount, source, target)}`;
  const isStock = item.source === "stock";

  const actions: ActionMenuItem[] = [];
  if (isStock && item.productId && onOpenProduct) {
    actions.push({
      key: "product",
      label: t("expenses.open_product"),
      icon: "cube-outline",
      onPress: () => onOpenProduct(item.productId!),
    });
  }
  if (item.canVoid && onVoid) {
    actions.push({
      key: "remove",
      label: t("expenses.remove"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => onVoid(item),
    });
  }

  return (
    <>
      <EntityCard
        icon={expenseCategoryIcon(item.category)}
        iconColor={isStock ? COLORS.primary : COLORS.warning}
        iconBgClassName={isStock ? "bg-indigo-50" : "bg-amber-50"}
        onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
      >
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {item.label}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {formatDate(item.date, locale)}
          </Text>
        </View>

        <View className="items-end ms-2">
          <Text fontWeight="Bold" className="text-base text-gray-900">
            {amountLabel}
          </Text>
          <Text
            className={`text-[10px] font-semibold uppercase tracking-wide mt-1 px-1.5 py-0.5 rounded ${
              isStock ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {t(expenseCategoryLabelKey(item.category))}
          </Text>
        </View>
      </EntityCard>

      <ActionMenu
        visible={menuOpen}
        title={item.label}
        actions={actions}
        onDismiss={() => setMenuOpen(false)}
      />
    </>
  );
}
