import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { COLORS } from "@/src/shared/constants";
import type { CollectionListItem } from "@/src/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";

interface Props {
  item: CollectionListItem;
  onVoid?: (item: CollectionListItem) => void;
  onSendInvoice?: (item: CollectionListItem) => void;
  /** On a single-customer surface the name on every row is noise. */
  hideCustomerName?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (item: CollectionListItem) => void;
  onEnterSelection?: (item: CollectionListItem) => void;
}

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
  const [expanded, setExpanded] = useState(false);

  const source = snapshotCurrency(item, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);

  const voided = item.voidedAt !== null;
  const multi = item.itemCount > 1;

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
      icon="cash-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      dimmed={voided}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={onToggleSelect ? () => onToggleSelect(item) : undefined}
      onEnterSelection={onEnterSelection ? () => onEnterSelection(item) : undefined}
      onMenu={actions.length > 0 ? () => setMenuOpen(true) : undefined}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-slate-900">{money(item.amount)}</Text>
          {!hideCustomerName && item.customerName ? (
            <Text className="text-xs text-slate-500" numberOfLines={1}>
              {item.customerName}
            </Text>
          ) : null}
        </View>

        <Text className="text-xs text-slate-500">{formatDateTimeShort(item.receivedAt, locale)}</Text>

        {multi ? (
          <PressableOpacity
            onPress={() => setExpanded((v) => !v)}
            className="mt-1 flex-row items-center gap-1"
          >
            <Text className="text-xs font-medium text-primary">
              {t("ledger.n_items", { count: item.itemCount })}
            </Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={12}
              color={COLORS.primary}
            />
          </PressableOpacity>
        ) : item.itemLabels[0] ? (
          <Text className="text-xs text-slate-600" numberOfLines={1}>
            {item.itemLabels[0]}
          </Text>
        ) : null}

        {multi && expanded && (
          <View className="mt-1 gap-1 border-l-2 border-slate-200 pl-2">
            {item.items.map((line, i) => (
              <View key={line.id} className="flex-row items-center justify-between">
                <Text className="flex-1 text-xs text-slate-600" numberOfLines={1}>
                  {item.itemLabels[i] || "—"}
                </Text>
                <Text className="text-xs text-slate-700">{money(line.amount)}</Text>
              </View>
            ))}
          </View>
        )}

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
