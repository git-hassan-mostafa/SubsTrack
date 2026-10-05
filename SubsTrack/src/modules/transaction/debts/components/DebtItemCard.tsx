import { useState } from "react";
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
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { toActionMenuItems, type Glyph } from "@/src/shared/lib/menuActions";
import type { OpenItem } from "@shared/core/types";
import { KIND_ICON } from "../utils/kindIcon";
import {
  findCurrency,
  formatMoneyPair,
  formatPaidFraction,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { formatDate } from "@shared/core/utils/date";
import {
  debtItemActions,
  debtItemFacts,
  type DebtItemActionKey,
} from "@shared/modules/transaction/debts/utils/debtItemView";

const DEBT_ACTION_ICONS: Record<DebtItemActionKey, Glyph> = {
  collect: "cash-outline",
  revert_write_off: "arrow-undo-outline",
  edit: "create-outline",
  write_off: "remove-circle-outline",
  remove: "trash-outline",
};

interface Props {
  item: OpenItem;
  onCollect?: (item: OpenItem) => void;
  onEdit?: (item: OpenItem) => void;
  onVoid?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  onRevertWriteOff?: (item: OpenItem) => void;
  onOpen?: (item: OpenItem) => void;
  hideCustomerName?: boolean;
  loading?: boolean;
  muted?: boolean;
}

// The kind is the icon, so a chip here always means something is wrong.
export function DebtItemCard({
  item,
  onCollect,
  onEdit,
  onVoid,
  onWriteOff,
  onRevertWriteOff,
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
  const facts = debtItemFacts(item);
  const paidFraction = facts.partlyPaid
    ? formatPaidFraction(item.paid, item.amount, source, source)
    : null;
  const late = facts.daysLate;
  const writtenOff = facts.writtenOff;
  const dead = muted || writtenOff;

  const titlesCustomer = !hideCustomerName || item.kind === "manual";
  const subtitle = titlesCustomer ? item.label : null;

  const handleOpen = onOpen && item.chargeId ? () => onOpen(item) : undefined;

  const bind = (handler?: (item: OpenItem) => void) =>
    handler ? () => handler(item) : undefined;
  const actions: ActionMenuItem[] = toActionMenuItems(debtItemActions(item), t, {
    icons: DEBT_ACTION_ICONS,
    run: {
      collect: bind(onCollect),
      revert_write_off: bind(onRevertWriteOff),
      edit: bind(onEdit),
      write_off: bind(onWriteOff),
      remove: bind(onVoid),
    },
  });

  return (
    <EntityCard
      icon={KIND_ICON[item.kind]}
      iconColor={dead ? COLORS.gray500 : COLORS.danger}
      iconBgClassName={dead ? "bg-gray-100" : "bg-red-50"}
      dimmed={dead}
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
          <CardChips>
            {late > 0 ? (
              <Chip text={t("ledger.days_late", { count: late })} tone="red" />
            ) : null}
            {paidFraction ? <Chip text={paidFraction} tone="amber" /> : null}
            {writtenOff ? (
              <Chip text={t("ledger.written_off")} tone="orange" />
            ) : null}
          </CardChips>
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
