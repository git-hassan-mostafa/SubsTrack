import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import type { Sale } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { formatDate } from "@/src/core/utils/date";
import { receiptId } from "@/src/core/utils/receiptId";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  CardAmount,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";

interface Props {
  sale: Sale;
  onPress: (sale: Sale) => void;
  onMenu?: (sale: Sale) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (sale: Sale) => void;
  onEnterSelection?: (sale: Sale) => void;
}

export function SaleCard({
  sale,
  onPress,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const source = snapshotCurrency(sale, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const voided = sale.voidedAt !== null;
  const fullyPaid = sale.amountPaid >= sale.totalAmount;
  const totalLabel = fullyPaid
    ? formatMoney(sale.totalAmount, source, target)
    : formatPaidFraction(sale.amountPaid, sale.totalAmount, source, target);

  return (
    <EntityCard
      icon="receipt-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      dimmed={voided}
      onPress={() => onPress(sale)}
      onMenu={onMenu ? () => onMenu(sale) : undefined}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(sale)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(sale) : undefined
      }
    >
      <View className="flex-1">
        <CardTitle numberOfLines={1}>#{receiptId(sale.id)}</CardTitle>
        <CardSubtitle className="mt-0.5" numberOfLines={1}>
          {sale.itemsSummary}
        </CardSubtitle>
        <CardMeta className="mt-0.5" numberOfLines={1}>
          {sale.customer?.name ?? t("sales.walk_in")}
          {" · "}
          {formatDate(sale.soldAt)}
        </CardMeta>
        {voided ? (
          <View className="mt-1 flex-row">
            <Chip
              text={
                sale.voidReason
                  ? `${t("sales.voided")} · ${sale.voidReason}`
                  : t("sales.voided")
              }
              tone="red"
            />
          </View>
        ) : null}
      </View>

      <View className="items-end ms-2">
        <CardAmount tone={voided ? "muted" : fullyPaid ? "default" : "danger"}>
          {totalLabel}
        </CardAmount>
      </View>
    </EntityCard>
  );
}
