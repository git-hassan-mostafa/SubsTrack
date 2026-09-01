import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { COLORS } from "@/src/shared/constants";
import type { CollectionListItem, WalletSource } from "@/src/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";

interface Props {
  item: CollectionListItem;
  onVoid?: (item: CollectionListItem) => void;
  onSendInvoice?: (item: CollectionListItem) => void;
  /**
   * Opens what this hand-over settled: the bill itself when it paid one, the
   * split sheet when it paid several. Never offered on a voided row.
   */
  onOpen?: (item: CollectionListItem) => void;
  /** True while this row's record is being fetched. */
  loading?: boolean;
  /** On a single-customer surface the name on every row is noise. */
  hideCustomerName?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (item: CollectionListItem) => void;
  onEnterSelection?: (item: CollectionListItem) => void;
}

// What the money PAID FOR — same icon + uppercase badge the debts card wears, so
// a bill and the cash that settled it read alike. Green because this is money IN;
// 'mixed' is indigo instead, because it names no single kind — one hand-over can
// settle a month AND a sale, and no allocation could split the physical cash.
const KIND_STYLE: Record<
  WalletSource,
  { icon: keyof typeof Ionicons.glyphMap; badge: string }
> = {
  month: { icon: "calendar-outline", badge: "bg-emerald-50 text-emerald-700" },
  sale: { icon: "receipt-outline", badge: "bg-emerald-50 text-emerald-700" },
  manual: { icon: "document-text-outline", badge: "bg-emerald-50 text-emerald-700" },
  mixed: { icon: "cash-outline", badge: "bg-indigo-50 text-indigo-700" },
};

/**
 * ONE hand-over of cash. The $55 Ali gave is one row here, never three.
 *
 * A hand-over that settled a single bill shows it inline; one that settled
 * several shows a "3 items" expander — so the common case stays compact and
 * the waterfall's split is one tap away.
 */
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
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const [menuOpen, setMenuOpen] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);

  const voided = item.voidedAt !== null;
  const multi = item.itemCount > 1;
  const style = KIND_STYLE[item.kind];

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
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      dimmed={voided}
      // A voided hand-over settled nothing any more, so it opens nothing.
      onPress={onOpen && !voided ? () => onOpen(item) : undefined}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={onToggleSelect ? () => onToggleSelect(item) : undefined}
      onEnterSelection={onEnterSelection ? () => onEnterSelection(item) : undefined}
      onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
      menuLoading={loading}
      reserveMenuSpace
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-base font-semibold text-slate-900">{money(item.amount)}</Text>
          <Text
            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${style.badge}`}
          >
            {t(`ledger.kind_${item.kind}`)}
          </Text>
        </View>

        <Text className="text-xs text-slate-500" numberOfLines={1}>
          {!hideCustomerName && item.customerName ? `${item.customerName} · ` : ""}
          {formatDateTimeShort(item.receivedAt, locale)}
        </Text>

        {/* A split hand-over says so; its bills are one tap away, not inline. */}
        {multi ? (
          <View className="mt-1 flex-row items-center gap-1 self-start rounded bg-slate-100 px-1.5 py-0.5">
            <Ionicons name="layers-outline" size={11} color={COLORS.gray600} />
            <Text className="text-[11px] font-medium text-slate-600">
              {t("ledger.n_items", { count: item.itemCount })}
            </Text>
          </View>
        ) : item.itemLabels[0] ? (
          <Text className="text-xs text-slate-600" numberOfLines={1}>
            {item.itemLabels[0]}
          </Text>
        ) : null}

        {voided && (
          <Text className="mt-1 text-xs text-red-600">
            {t("ledger.voided")}
            {item.voidReason ? ` · ${item.voidReason}` : ""}
          </Text>
        )}
      </View>

      <ActionMenu visible={menuOpen} onDismiss={() => setMenuOpen(false)} actions={actions} />
    </EntityCard>
  );
}
