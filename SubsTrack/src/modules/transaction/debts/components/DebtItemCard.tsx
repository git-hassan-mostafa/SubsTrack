import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { ChargeKind, OpenItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { daysLate, formatDateTimeShort } from "@/src/core/utils/date";

interface Props {
  item: OpenItem;
  /** Opens the collect sheet for THIS bill alone. */
  onCollect?: (item: OpenItem) => void;
  /** The bill was a mistake. Only a hand-typed fee can be removed from here. */
  onVoid?: (item: OpenItem) => void;
  /** The bill is real but lost — recorded as a loss, still shown as owed. */
  onWriteOff?: (item: OpenItem) => void;
  /** Opens the record behind the row (a bill's payments, a sale's receipt). */
  onOpen?: (item: OpenItem) => void;
  // On a single-customer surface the name is redundant on every row; when true
  // the label becomes the primary line instead of the customer name.
  hideCustomerName?: boolean;
  /** True while this row's record is being fetched (the card shows a spinner). */
  loading?: boolean;
  /** Renders the row muted — used for the plain unpaid months section. */
  muted?: boolean;
}

const KIND_STYLE: Record<
  ChargeKind,
  { icon: keyof typeof Ionicons.glyphMap; badge: string }
> = {
  month: { icon: "calendar-outline", badge: "bg-red-50 text-red-700" },
  sale: { icon: "receipt-outline", badge: "bg-red-50 text-red-700" },
  manual: { icon: "document-text-outline", badge: "bg-red-50 text-red-700" },
};

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
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const amountLabel = formatMoney(item.balance, source, target);
  // "20/50 $" — collected out of owed. Only shown once money has reached the
  // bill; before that the amount already says everything.
  const paidFraction =
    item.paid > 0
      ? formatPaidFraction(item.paid, item.amount, source, source)
      : null;
  const style = KIND_STYLE[item.kind];
  const late = daysLate(item.dueDate);
  // When the bill was actually raised, clock time included. Only a STORED bill
  // has a real instant — a virtual month's `issuedAt` is just its billing month,
  // so printing a time there would invent one.
  const billedAt = item.chargeId
    ? formatDateTimeShort(item.issuedAt, locale)
    : null;

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
  // A bill that exists can be written off; a virtual unpaid month has no row
  // yet, so there is nothing to give up on.
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
    <>
      <EntityCard
        icon={style.icon}
        iconColor={muted ? COLORS.gray500 : COLORS.danger}
        iconBgClassName={muted ? "bg-gray-100" : "bg-red-50"}
        dimmed={muted}
        onPress={onOpen ? () => onOpen(item) : undefined}
        onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
        reserveMenuSpace
        menuLoading={loading}
      >
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-gray-900"
            numberOfLines={1}
          >
            {hideCustomerName ? item.label : item.customerName}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {hideCustomerName ? "" : `${item.label} · `}
            {billedAt ? ` · ${billedAt}` : ""}
            {/* How far behind — the one thing a debts list is really asking. */}
            {late > 0 ? ` · ${t("ledger.days_late", { count: late })}` : ""}
            {/* Collected out of owed — says WHY the row owes what it owes. Sits
                here, not under the amount, so the card keeps its height. */}
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
            {t(`ledger.kind_${item.kind}`)}
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
