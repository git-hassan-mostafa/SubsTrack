import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  CardAmount,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { Chip } from "@/src/shared/components/Chip";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { CollectionListItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoneyPair,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDateTime } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { KIND_STYLE } from "../utils/kindStyle";
import { collectionLabel } from "../utils/collectionLabel";

interface Props {
  item: CollectionListItem;
  onVoid?: (item: CollectionListItem) => void;
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
  const users = useUserSlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(item.amount, source, display);

  const voided = item.voidedAt !== null;
  const style = KIND_STYLE[item.kind];
  const paidFor = collectionLabel(item, t);
  const collector = users.find((u) => u.id === item.receivedByUserId)?.fullName;
  const holder =
    item.heldByUserId === null
      ? t("ledger.banked")
      : item.heldByUserId !== item.receivedByUserId
        ? users.find((u) => u.id === item.heldByUserId)?.fullName
        : undefined;

  const actions: ActionMenuItem[] = [];
  if (onSendInvoice && !voided) {
    actions.push({
      key: "invoice",
      label: t("invoicing.send_on_whatsapp"),
      icon: "logo-whatsapp",
      onPress: () => {
        setMenuOpen(false);
        onSendInvoice(item);
      },
    });
  }
  if (onVoid && !voided) {
    actions.push({
      key: "void",
      label: t("ledger.void_payment"),
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

        <View className="mt-1 flex-row flex-wrap items-center gap-1">
          <Chip text={t(`ledger.kind_${item.kind}`)} tone={style.chipTone} />
          {item.itemCount > 1 ? (
            <Chip
              text={t("ledger.n_items", { count: item.itemCount })}
              tone="gray"
            />
          ) : null}
          {holder && !voided ? (
            <Chip text={holder} tone="amber" />
          ) : null}
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
        </View>
      </View>

      <ActionMenu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        actions={actions}
      />
    </EntityCard>
  );
}
