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
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { toActionMenuItems, type Glyph } from "@/src/shared/lib/menuActions";
import type { ExpenseItem } from "@shared/core/types";
import { snapshotCurrency } from "@shared/core/utils/currency";
import { outflowLabel } from "@shared/modules/transaction/expenses/utils/outflow";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { formatDate } from "@shared/core/utils/date";
import { expenseCategoryLabelKey } from "@shared/modules/transaction/expenses/utils/expenseCategories";
import {
  EXPENSE_SOURCE_TONE,
  expenseMenuItems,
  type ExpenseActionKey,
} from "@shared/modules/transaction/expenses/utils/expenseList";
import { expenseCategoryIcon } from "../utils/expenseCategoryIcon";

const EXPENSE_ACTION_ICONS: Record<ExpenseActionKey, Glyph> = {
  product: "cube-outline",
  remove: "trash-outline",
};

interface Props {
  item: ExpenseItem;
  onVoid?: (item: ExpenseItem) => void;
  onOpenProduct?: (productId: string) => void;
}

export function ExpenseCard({ item, onVoid, onOpenProduct }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const target = useDisplayCurrency();

  const amountLabel = outflowLabel(item.amount, source, target);
  const isStock = item.source === "stock";
  const productId = item.productId;

  const actions = toActionMenuItems(expenseMenuItems(item), t, {
    icons: EXPENSE_ACTION_ICONS,
    run: {
      product:
        productId && onOpenProduct ? () => onOpenProduct(productId) : undefined,
      remove: onVoid ? () => onVoid(item) : undefined,
    },
  });

  return (
    <>
      <EntityCard
        icon={expenseCategoryIcon(item.category)}
        iconColor={isStock ? COLORS.primary : COLORS.warning}
        iconBgClassName={isStock ? "bg-indigo-50" : "bg-amber-50"}
        onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
        reserveMenuSpace
      >
        <View className="flex-1 me-2">
          <CardTitle numberOfLines={1}>{item.label}</CardTitle>
          <CardSubtitle className="mt-0.5" numberOfLines={1}>
            {formatDate(item.date)}
          </CardSubtitle>
        </View>

        <View className="items-end">
          <CardAmount>{amountLabel}</CardAmount>
          <View className="mt-1">
            <Chip
              text={t(expenseCategoryLabelKey(item.category))}
              tone={EXPENSE_SOURCE_TONE[item.source]}
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
