import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  CardAmount,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { ExpenseItem } from "@/src/core/types";
import {
  findCurrency,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { outflowLabel } from "../utils/outflow";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { formatDate } from "@/src/core/utils/date";
import {
  expenseCategoryIcon,
  expenseCategoryLabelKey,
} from "../utils/expenseCategories";

interface Props {
  item: ExpenseItem;
  onVoid?: (item: ExpenseItem) => void;
  onOpenProduct?: (productId: string) => void;
}

export function ExpenseCard({ item, onVoid, onOpenProduct }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const target = findCurrency(currencies, displayCurrencyId);

  const amountLabel = outflowLabel(item.amount, source, target);
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
        reserveMenuSpace
      >
        <View className="flex-1">
          <CardTitle numberOfLines={1}>{item.label}</CardTitle>
          <CardSubtitle className="mt-0.5" numberOfLines={1}>
            {formatDate(item.date)}
          </CardSubtitle>
        </View>

        <View className="items-end ms-2">
          <CardAmount>{amountLabel}</CardAmount>
          <View className="mt-1">
            <Chip
              text={t(expenseCategoryLabelKey(item.category))}
              tone={isStock ? "indigo" : "amber"}
            />
          </View>
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
