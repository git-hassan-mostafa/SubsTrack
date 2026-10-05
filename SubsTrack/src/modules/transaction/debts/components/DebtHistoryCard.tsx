import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  CardAmount,
  CardChips,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { COLORS } from "@/src/shared/constants";
import { Chip } from "@/src/shared/components/Chip";
import { EntityCard } from "@/src/shared/components/EntityCard";
import type { DebtHistoryItem } from "@shared/core/types";
import {
  findCurrency,
  formatMoney,
  formatMoneyPair,
  formatPaidFraction,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { formatDate } from "@shared/core/utils/date";
import {
  daysLateSettling,
  daysOverdue,
  HISTORY_OUTCOME_TONE,
  historyOutcomeOf,
  isDeadHistoryRow,
  laterPaidOf,
  type HistoryOutcome,
} from "@shared/modules/transaction/debts/utils/debtHistory";
import { KIND_ICON } from "../utils/kindIcon";

interface Props {
  item: DebtHistoryItem;
  onOpen?: (item: DebtHistoryItem) => void;
  loading?: boolean;
}

const OUTCOME_ICON: Record<HistoryOutcome, { color: string; bg: string }> = {
  settled: { color: COLORS.success, bg: "bg-emerald-50" },
  partial: { color: COLORS.warning, bg: "bg-amber-50" },
  open: { color: COLORS.danger, bg: "bg-red-50" },
  written_off: { color: COLORS.gray500, bg: "bg-gray-100" },
};

// Collected out of billed: a settled bill's balance alone reads 0.
export function DebtHistoryCard({ item, onOpen, loading = false }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const outcome = historyOutcomeOf(item);
  const icon = OUTCOME_ICON[outcome];
  const dead = isDeadHistoryRow(item);

  const fraction = formatPaidFraction(item.downPaid, item.amount, source, source);
  const laterPaid = laterPaidOf(item);
  const { approx } = formatMoneyPair(item.amount, source, display);

  const lateSettling = daysLateSettling(item);
  const overdue = daysOverdue(item);

  return (
    <EntityCard
      icon={KIND_ICON[item.kind]}
      iconColor={icon.color}
      iconBgClassName={icon.bg}
      dimmed={dead}
      onPress={onOpen && item.chargeId ? () => onOpen(item) : undefined}
      reserveMenuSpace
      menuLoading={loading}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start justify-between gap-2">
          <CardTitle className="flex-1" numberOfLines={1}>
            {item.customerName}
          </CardTitle>
          <View className="items-end">
            <CardAmount>{fraction}</CardAmount>
            {approx ? <CardMeta>{approx}</CardMeta> : null}
          </View>
        </View>

        <CardSubtitle numberOfLines={1}>{item.label}</CardSubtitle>

        <CardMeta numberOfLines={1}>
          {t("ledger.due_date")} {formatDate(item.dueDate)}
          {item.settledAt
            ? ` · ${t("debts.history_settled_on", {
                date: formatDate(item.settledAt),
              })}`
            : ""}
        </CardMeta>

        <CardChips>
          <Chip text={t(`debts.outcome_${outcome}`)} tone={HISTORY_OUTCOME_TONE[outcome]} />
          {laterPaid > 0 ? (
            <Chip
              text={t("debts.history_paid_later", {
                amount: formatMoney(laterPaid, source, source),
              })}
              tone="emerald"
            />
          ) : null}
          {item.balance > 0 ? (
            <Chip
              text={t("debts.history_still_owed", {
                amount: formatMoney(item.balance, source, source),
              })}
              tone="red"
            />
          ) : null}
          {lateSettling ? (
            <Chip
              text={t("debts.history_settled_late", { count: lateSettling })}
              tone="amber"
            />
          ) : null}
          {overdue ? (
            <Chip text={t("ledger.days_late", { count: overdue })} tone="red" />
          ) : null}
        </CardChips>
      </View>
    </EntityCard>
  );
}
