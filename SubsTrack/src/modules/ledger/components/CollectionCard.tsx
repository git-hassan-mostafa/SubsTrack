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
import { EntityCard } from "@/src/shared/components/EntityCard";
import { Chip } from "@/src/shared/components/Chip";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import type { CollectionListItem } from "@shared/core/types";
import {
  findCurrency,
  formatMoneyPair,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { KIND_STYLE } from "../utils/kindStyle";
import { KIND_TONE } from "@shared/modules/ledger/utils/collectionKind";
import { collectionLabel } from "@shared/modules/ledger/utils/collectionLabel";
import { PAYMENT_ACTION_ICONS } from "../utils/paymentActionIcons";
import {
  heldByLabel,
  isHeldByCollector,
  paymentMenuItems,
} from "@shared/modules/ledger/utils/collectionView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";

interface Props {
  item: CollectionListItem;
  onVoid?: (item: CollectionListItem) => void;
  onCorrect?: (item: CollectionListItem) => void;
  onSendInvoice?: (item: CollectionListItem) => void;
  onOpen?: (item: CollectionListItem) => void;
  loading?: boolean;
  hideCustomerName?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (item: CollectionListItem) => void;
  onEnterSelection?: (item: CollectionListItem) => void;
}

export function CollectionCard({
  item,
  onVoid,
  onCorrect,
  onSendInvoice,
  onOpen,
  loading = false,
  hideCustomerName,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const userName = useUserNames();
  const displayCurrencyId = useDisplayCurrencyId();
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(item.amount, source, display);

  const voided = item.voidedAt !== null;
  const style = KIND_STYLE[item.kind];
  const paidFor = collectionLabel(item, t);
  const collector = userName(item.receivedByUserId);
  const holder = isHeldByCollector(item) ? null : heldByLabel(item, t, userName);

  const bind = (handler?: (item: CollectionListItem) => void) =>
    handler ? () => handler(item) : undefined;
  const actions = toActionMenuItems(
    paymentMenuItems(item, { sendable: !!onSendInvoice }),
    t,
    {
      icons: PAYMENT_ACTION_ICONS,
      run: {
        invoice: bind(onSendInvoice),
        correct: bind(onCorrect),
        void: bind(onVoid),
      },
    },
  );

  return (
    <EntityCard
      icon={style.icon}
      iconColor={style.color}
      iconBgClassName={style.bgClassName}
      dimmed={voided}
      onPress={onOpen ? () => onOpen(item) : undefined}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={onToggleSelect ? () => onToggleSelect(item) : undefined}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(item) : undefined
      }
      onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
      menuLoading={loading}
      reserveMenuSpace
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start justify-between gap-2">
          <CardTitle className="flex-1" numberOfLines={1}>
            {hideCustomerName
              ? paidFor
              : (item.customerName ?? t("ledger.walk_in"))}
          </CardTitle>
          <View className="items-end">
            <CardAmount tone={voided ? "muted" : "default"}>
              {money.primary}
            </CardAmount>
            {money.approx ? <CardMeta>{money.approx}</CardMeta> : null}
          </View>
        </View>

        {hideCustomerName ? null : (
          <CardSubtitle numberOfLines={1}>{paidFor}</CardSubtitle>
        )}

        <CardMeta numberOfLines={1}>
          {collector ? `${collector} · ` : ""}
          {formatDateTime(item.receivedAt)}
        </CardMeta>

        <CardChips>
          <Chip text={t(`ledger.kind_${item.kind}`)} tone={KIND_TONE[item.kind]} />
          {item.itemCount > 1 ? (
            <Chip
              text={t("ledger.n_items", { count: item.itemCount })}
              tone="gray"
            />
          ) : null}
          {holder ? <Chip text={holder} tone="amber" /> : null}
          {voided ? (
            <Chip
              text={
                item.voidReason
                  ? `${t("ledger.voided")} · ${item.voidReason}`
                  : t("ledger.voided")
              }
              tone="red"
            />
          ) : null}
        </CardChips>
      </View>

      <ActionMenu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        actions={actions}
      />
    </EntityCard>
  );
}
