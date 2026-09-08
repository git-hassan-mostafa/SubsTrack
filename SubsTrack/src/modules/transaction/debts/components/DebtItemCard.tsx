import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import {
  CardAmount,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { COLORS } from "@/src/shared/constants";
import { Chip } from "@/src/shared/components/Chip";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { ChargeKind, OpenItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoneyPair,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { daysLate, formatDate } from "@/src/core/utils/date";

interface Props {
  item: OpenItem;
  onCollect?: (item: OpenItem) => void;
  onVoid?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  onOpen?: (item: OpenItem) => void;
  hideCustomerName?: boolean;
  loading?: boolean;
  muted?: boolean;
}

const KIND_ICON: Record<ChargeKind, keyof typeof Ionicons.glyphMap> = {
  month: "calendar-outline",
  sale: "receipt-outline",
  manual: "document-text-outline",
};

/**
 * ONE bill that still owes money — the debts twin of `CollectionCard`.
 *
 * The kind is the icon, so it wears no chip; a chip here means something is
 * WRONG with the bill — late, part paid, written off — so a clean row is bare.
 */
export function DebtItemCard({
  item,
  onCollect,
  onVoid,
  onWriteOff,
  onOpen,
  hideCustomerName,
  loading = false,
  muted = false,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(item.balance, source, display);
  const paidFraction =
    item.paid > 0
      ? formatPaidFraction(item.paid, item.amount, source, source)
      : null;
  const late = daysLate(item.dueDate);
  const writtenOff = item.charge?.writtenOffAt != null;

  const titlesCustomer = !hideCustomerName || item.kind === "manual";
  const subtitle = titlesCustomer ? item.label : null;

  const handleOpen = onOpen && item.chargeId ? () => onOpen(item) : undefined;

  const actions: ActionMenuItem[] = [];
  if (onCollect) {
    actions.push({
      key: "collect",
      label: t("payments.collect"),
      icon: "cash-outline",
      onPress: () => {
        setMenuOpen(false);
        onCollect(item);
      },
    });
  }
  if (onWriteOff && item.chargeId) {
    actions.push({
      key: "write_off",
      label: t("ledger.write_off"),
      icon: "remove-circle-outline",
      caption: t("ledger.write_off_caption"),
      onPress: () => {
        setMenuOpen(false);
        onWriteOff(item);
      },
    });
  }
  if (onVoid && item.kind === "manual" && item.chargeId) {
    actions.push({
      key: "remove",
      label: t("debts.remove"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        setMenuOpen(false);
        onVoid(item);
      },
    });
  }

  return (
    <EntityCard
      icon={KIND_ICON[item.kind]}
      iconColor={muted ? COLORS.gray500 : COLORS.danger}
      iconBgClassName={muted ? "bg-gray-100" : "bg-red-50"}
      dimmed={muted}
      onPress={handleOpen}
      onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
      reserveMenuSpace
      menuLoading={loading}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start justify-between gap-2">
          <CardTitle className="flex-1" numberOfLines={1}>
            {titlesCustomer ? item.customerName : item.label}
          </CardTitle>
          <View className="items-end">
            <CardAmount>{money.primary}</CardAmount>
            {money.approx ? <CardMeta>{money.approx}</CardMeta> : null}
          </View>
        </View>

        {subtitle ? (
          <CardSubtitle numberOfLines={1}>{subtitle}</CardSubtitle>
        ) : null}

        <CardMeta numberOfLines={1}>
          {t("ledger.due_date")} {formatDate(item.dueDate)}
        </CardMeta>

        {late > 0 || paidFraction || writtenOff ? (
          <View className="mt-1 flex-row flex-wrap items-center gap-1">
            {late > 0 ? (
              <Chip text={t("ledger.days_late", { count: late })} tone="red" />
            ) : null}
            {paidFraction ? <Chip text={paidFraction} tone="amber" /> : null}
            {writtenOff ? (
              <Chip text={t("ledger.written_off")} tone="orange" />
            ) : null}
          </View>
        ) : null}
      </View>

      <ActionMenu
        visible={menuOpen}
        title={item.label}
        actions={actions}
        onDismiss={() => setMenuOpen(false)}
      />
    </EntityCard>
  );
}
