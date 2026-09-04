import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
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
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import {
  daysLate,
  formatDate,
  formatDateTimeShort,
} from "@/src/core/utils/date";

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

interface KindStyle {
  icon: keyof typeof Ionicons.glyphMap;
  chipClassName: string;
}

const KIND_STYLE: Record<ChargeKind, KindStyle> = {
  month: {
    icon: "calendar-outline",
    chipClassName: "bg-teal-50 text-teal-700",
  },
  sale: { icon: "receipt-outline", chipClassName: "bg-teal-50 text-teal-700" },
  manual: {
    icon: "document-text-outline",
    chipClassName: "bg-violet-50 text-violet-700",
  },
};

/**
 * ONE bill that still owes money — the debts twin of `CollectionCard`.
 *
 * Read top-down it answers what a debts list is opened with: what is owed, how
 * much, when it was due, and what state the bill is in. The facts that used to
 * be crammed into one grey micro-line are chips now, because "40 days late" is
 * the point of the row and was the easiest thing on it to miss.
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
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(item.balance, source, display);
  const paidFraction =
    item.paid > 0
      ? formatPaidFraction(item.paid, item.amount, source, source)
      : null;
  const style = KIND_STYLE[item.kind];
  const late = daysLate(item.dueDate);
  const writtenOff = item.charge?.writtenOffAt != null;
  const billedAt = item.chargeId
    ? formatDateTimeShort(item.issuedAt, locale)
    : null;

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
      icon={style.icon}
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
          <Text
            className="flex-1 text-base font-semibold text-slate-900"
            numberOfLines={1}
          >
            {hideCustomerName ? item.label : item.customerName}
          </Text>
          <View className="items-end">
            <Text className="text-base font-semibold text-slate-900">
              {money.primary}
            </Text>
            {money.approx ? (
              <Text className="text-[11px] text-slate-400">{money.approx}</Text>
            ) : null}
          </View>
        </View>

        {hideCustomerName ? null : (
          <Text className="text-xs text-slate-600" numberOfLines={1}>
            {item.label}
          </Text>
        )}
        {/* Both dates the bill owns — tight leading keeps them one block. */}
        <View>
          <Text
            className="text-[11px] leading-[15px] text-slate-500"
            numberOfLines={1}
          >
            {t("ledger.due_date")} {formatDate(item.dueDate, locale)}
          </Text>
          {billedAt ? (
            <Text
              className="text-[11px] leading-[15px] text-slate-500"
              numberOfLines={1}
            >
              {t("ledger.issued_at")} {billedAt}
            </Text>
          ) : null}
        </View>
        <View className="mt-1 flex-row flex-wrap items-center gap-1">
          <Chip
            text={t(`ledger.kind_${item.kind}`)}
            className={style.chipClassName}
          />
          {late > 0 ? (
            <Chip
              text={t("ledger.days_late", { count: late })}
              className="bg-red-50 text-red-700"
            />
          ) : null}
          {paidFraction ? (
            <Chip text={paidFraction} className="bg-amber-50 text-amber-700" />
          ) : null}
          {writtenOff ? (
            <Chip
              text={t("ledger.written_off")}
              className="bg-orange-50 text-orange-700"
            />
          ) : null}
        </View>
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
