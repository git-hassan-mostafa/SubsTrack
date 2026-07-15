import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Checkbox } from "@/src/shared/components/Checkbox";
import {
  SelectionBar,
  type SelectionAction,
} from "@/src/shared/components/SelectionBar";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { useSelection } from "@/src/shared/hooks/useSelection";
import { COLORS } from "@/src/shared/constants";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { formatDate } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import type {
  CollectorWalletDetail,
  WalletItem,
  WalletSource,
} from "@/src/core/types";

const SOURCE_META: Record<
  WalletSource,
  {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bg: string;
    labelKey: string;
  }
> = {
  payment: {
    icon: "card-outline",
    color: COLORS.primary,
    bg: "bg-indigo-50",
    labelKey: "wallet.source_payment",
  },
  sale: {
    icon: "cube-outline",
    color: COLORS.success,
    bg: "bg-green-50",
    labelKey: "wallet.source_sale",
  },
  debt_payment: {
    icon: "cash-outline",
    color: COLORS.warning,
    bg: "bg-amber-50",
    labelKey: "wallet.source_debt",
  },
};

// Composite key — an id alone isn't unique across the three sources.
const keyOf = (it: WalletItem) => `${it.source}:${it.id}`;

// Local calendar day (YYYY-MM-DD) of an ISO timestamp, matching how the card
// shows the date — so the date-range filter agrees with what the user sees.
function localDay(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

interface Props {
  detail: CollectorWalletDetail | null;
  loading: boolean;
  // Read-only (the collector viewing their own wallet) — hides all receive
  // actions and multi-select. Filters still work.
  readOnly?: boolean;
  // Whether a receive action is currently running (disables the buttons).
  busy?: boolean;
  // Hand over the given transactions. Resolves true when it went through (so the
  // caller's confirm was accepted) — used to clear the selection afterward.
  onReceiveItems?: (items: WalletItem[]) => Promise<boolean>;
  onReceiveAll?: () => void;
}

// The body of a collector's wallet: the per-currency cash breakdown, an optional
// "receive all" action, filters, and the list of individual transactions still
// held. Each transaction can be received on its own, or several selected and
// received at once. Used by the admin detail sheet (interactive) and the
// collector self-view (read-only).
export function WalletDetailView({
  detail,
  loading,
  readOnly = false,
  busy = false,
  onReceiveItems,
  onReceiveAll,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const target = findCurrency(currencies, displayCurrencyId);
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const selection = useSelection();
  const selecting = !readOnly && selection.active;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<WalletSource | null>(null);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const allItems = detail?.items ?? [];
  const collectorId = detail?.collectorUserId ?? null;

  // Switching to a different collector resets the view. Refetches for the SAME
  // collector (e.g. after receiving) keep the id, so filters/selection persist.
  useEffect(() => {
    setFiltersOpen(false);
    setCustomerFilter(null);
    setTypeFilter(null);
    setFromDate(null);
    setToDate(null);
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectorId]);

  // Raw cash amount formatted in its own currency (source === target, so the
  // live rate is irrelevant — this shows the physical cash count).
  const inOwnCurrency = (amount: number, currencyId: string | null) => {
    const cur = findCurrency(currencies, currencyId);
    return formatMoney(amount, cur, cur);
  };

  // Customer options are just the distinct customers present in this wallet.
  const customerOptions: DropdownOption<string>[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of allItems) {
      if (it.customerId && it.customerName)
        map.set(it.customerId, it.customerName);
    }
    return [...map.entries()].map(([value, label]) => ({ label, value }));
  }, [allItems]);

  const typeOptions: DropdownOption<WalletSource>[] = [
    { label: t("wallet.source_payment"), value: "payment" },
    { label: t("wallet.source_sale"), value: "sale" },
    { label: t("wallet.source_debt"), value: "debt_payment" },
  ];

  const hasActiveFilters =
    !!customerFilter || !!typeFilter || !!fromDate || !!toDate;

  const filtered = useMemo(
    () =>
      allItems.filter((it) => {
        if (typeFilter && it.source !== typeFilter) return false;
        if (customerFilter && it.customerId !== customerFilter) return false;
        if (fromDate || toDate) {
          const day = localDay(it.date);
          if (fromDate && day < fromDate) return false;
          if (toDate && day > toDate) return false;
        }
        return true;
      }),
    [allItems, typeFilter, customerFilter, fromDate, toDate],
  );

  function clearFilters() {
    setCustomerFilter(null);
    setTypeFilter(null);
    setFromDate(null);
    setToDate(null);
  }

  async function receive(items: WalletItem[]) {
    if (items.length === 0) return;
    const ok = await onReceiveItems?.(items);
    if (ok) selection.clear();
  }

  const selectionActions: SelectionAction[] = [
    {
      key: "receive",
      icon: "checkmark-done-outline",
      label: t("wallet.receive"),
      disabled: busy,
      onPress: () =>
        void receive(allItems.filter((it) => selection.isSelected(keyOf(it)))),
    },
  ];

  if (loading && !detail) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const isEmpty = allItems.length === 0;
  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((it) => selection.isSelected(keyOf(it)));

  return (
    <View className="flex-1">
      {selecting ? (
        <SelectionBar
          count={selection.count}
          actions={selectionActions}
          onClose={selection.clear}
          allSelected={allFilteredSelected}
          onToggleAll={() => selection.toggleMany(filtered.map(keyOf))}
        />
      ) : null}

      <ScrollView
        className="flex-1 px-6 pt-2"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* Grand total (USD → display currency) — the full wallet, not the filtered subset. */}
        <View className="items-center py-4">
          <Text className="text-xs text-gray-400 uppercase tracking-wide">
            {t("wallet.total_held")}
          </Text>
          <Text fontWeight="Bold" className="text-3xl text-gray-900 mt-1">
            {formatMoney(detail?.totalUsd ?? 0, null, target)}
          </Text>
        </View>

        {/* Per-currency physical cash breakdown (only when >1 currency involved). */}
        {detail && detail.byCurrency.length > 1 ? (
          <View className="bg-gray-50 rounded-2xl px-4 py-2 mb-4">
            {detail.byCurrency.map((ct) => (
              <View
                key={ct.currencyId ?? "USD"}
                className="flex-row items-center justify-between py-2"
              >
                <Text className="text-sm text-gray-500">
                  {findCurrency(currencies, ct.currencyId)?.code ?? "USD"}
                </Text>
                <Text className="text-sm font-semibold text-gray-900">
                  {inOwnCurrency(ct.amount, ct.currencyId)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Receive all — hidden while selecting or read-only. */}
        {!readOnly && !selecting && !isEmpty ? (
          <PressableOpacity
            onPress={onReceiveAll}
            disabled={busy}
            className={`flex-row items-center justify-center gap-2 rounded-xl py-3 mb-5 ${
              busy ? "bg-primary/60" : "bg-primary"
            }`}
          >
            <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
            <Text className="text-sm font-semibold text-white">
              {t("wallet.receive_all")}
            </Text>
          </PressableOpacity>
        ) : null}

        {isEmpty ? (
          <EmptyState
            message={t("wallet.empty_title")}
            subMessage={t("wallet.empty_desc")}
          />
        ) : (
          <View>
            {/* Section header + filter toggle — hidden while selecting. */}
            {!selecting ? (
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {t("wallet.transactions_section")}
                </Text>
                <FilterToggleButton
                  active={filtersOpen}
                  hasActiveFilters={hasActiveFilters}
                  onPress={() => setFiltersOpen((v) => !v)}
                />
              </View>
            ) : null}

            {!selecting && filtersOpen ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                className="-mx-6 mb-3"
                contentContainerStyle={{
                  paddingHorizontal: 24,
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {customerOptions.length > 0 ? (
                  <Dropdown<string>
                    placeholder={t("wallet.filter_by_customer")}
                    options={customerOptions}
                    value={customerFilter}
                    onChange={setCustomerFilter}
                    nullable
                    nullLabel={t("wallet.all_customers")}
                    triggerStyle="chip"
                  />
                ) : null}
                <Dropdown<WalletSource>
                  placeholder={t("wallet.filter_by_type")}
                  options={typeOptions}
                  value={typeFilter}
                  onChange={setTypeFilter}
                  nullable
                  nullLabel={t("wallet.all_types")}
                  triggerStyle="chip"
                />
                <DatePickerInput
                  placeholder={t("wallet.date_from")}
                  value={fromDate ?? ""}
                  onChange={(v) => setFromDate(v || null)}
                  maxDate={toDate ?? undefined}
                  triggerStyle="chip"
                  clearable
                />
                <DatePickerInput
                  placeholder={t("wallet.date_to")}
                  value={toDate ?? ""}
                  onChange={(v) => setToDate(v || null)}
                  minDate={fromDate ?? undefined}
                  triggerStyle="chip"
                  clearable
                />
                {hasActiveFilters ? (
                  <PressableOpacity
                    onPress={clearFilters}
                    className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
                  >
                    <Ionicons name="close" size={14} color={COLORS.gray500} />
                    <Text className="text-sm font-medium text-gray-500">
                      {t("common.clear_filters")}
                    </Text>
                  </PressableOpacity>
                ) : null}
              </ScrollView>
            ) : null}

            {filtered.length === 0 ? (
              <EmptyState
                message={t("wallet.filter_empty_title")}
                subMessage={t("wallet.filter_empty_desc")}
              />
            ) : (
              filtered.map((item) => {
                const meta = SOURCE_META[item.source];
                const k = keyOf(item);
                const checked = selection.isSelected(k);
                const subline = [
                  t(meta.labelKey),
                  item.label,
                  formatDate(item.date, locale),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <PressableOpacity
                    key={k}
                    disabled={readOnly}
                    onPress={selecting ? () => selection.toggle(k) : undefined}
                    onLongPress={
                      !readOnly && !selecting
                        ? () => selection.enterWith(k)
                        : undefined
                    }
                    className="bg-white border border-gray-100 rounded-2xl px-4 py-3 mb-2.5 flex-row items-center"
                  >
                    {selecting ? (
                      <View className="w-9 h-9 items-center justify-center me-3">
                        <Checkbox checked={checked} />
                      </View>
                    ) : (
                      <View
                        className={`w-9 h-9 rounded-xl items-center justify-center me-3 ${meta.bg}`}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={16}
                          color={meta.color}
                        />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text
                        className="text-sm font-semibold text-gray-900"
                        numberOfLines={1}
                      >
                        {item.customerName ?? t("wallet.walk_in")}
                      </Text>
                      <Text
                        className="text-[11px] text-gray-400 mt-0.5"
                        numberOfLines={1}
                      >
                        {subline}
                      </Text>
                    </View>
                    <View className="items-end ms-2">
                      <Text className="text-sm font-semibold text-gray-900">
                        {inOwnCurrency(item.amount, item.currencyId)}
                      </Text>
                      {!readOnly && !selecting ? (
                        <PressableOpacity
                          onPress={() => void receive([item])}
                          disabled={busy}
                          hitSlop={6}
                          className="mt-1"
                        >
                          <Text className="text-xs font-semibold text-primary">
                            {t("wallet.receive")}
                          </Text>
                        </PressableOpacity>
                      ) : null}
                    </View>
                  </PressableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
