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
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import { EntityCard } from "@/src/shared/components/EntityCard";
import type { DebtHistoryItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { formatDate } from "@/src/core/utils/date";
import {
  daysLateSettling,
  daysOverdue,
  historyOutcomeOf,
  type HistoryOutcome,
} from "../utils/debtHistory";
import { KIND_ICON } from "../utils/kindIcon";

interface Props {
  item: DebtHistoryItem;
  onOpen?: (item: DebtHistoryItem) => void;
  loading?: boolean;
}

const OUTCOME_TONE: Record<
  HistoryOutcome,
  { chip: ChipTone; icon: string; bg: string }
> = {
  settled: { chip: "emerald", icon: COLORS.success, bg: "bg-emerald-50" },
  partial: { chip: "amber", icon: COLORS.warning, bg: "bg-amber-50" },
  open: { chip: "red", icon: COLORS.danger, bg: "bg-red-50" },
  written_off: { chip: "orange", icon: COLORS.gray500, bg: "bg-gray-100" },
};

/**
 * ONE past bill and what became of it.
 *
 * The money is a FRACTION — collected out of billed — because neither half
 * alone tells the story: a settled bill's balance reads 0, and the amount on
 * its own hides how much ever actually arrived.
 */
export function DebtHistoryCard({ item, onOpen, loading = false }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const outcome = historyOutcomeOf(item);
  const tone = OUTCOME_TONE[outcome];
  const dead = outcome === "written_off";

  const fraction = formatPaidFraction(item.downPaid, item.amount, source, source);
  const laterPaid = item.paid - item.downPaid;
  const sameCurrency = (source?.id ?? null) === (display?.id ?? null);
  const approx = sameCurrency
    ? null
    : `≈ ${formatMoney(item.amount, source, display)}`;

  const lateSettling = daysLateSettling(item);
  const overdue = daysOverdue(item);

  return (
    <EntityCard
      icon={KIND_ICON[item.kind]}
      iconColor={tone.icon}
      iconBgClassName={tone.bg}
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
          <Chip text={t(`debts.outcome_${outcome}`)} tone={tone.chip} />
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
