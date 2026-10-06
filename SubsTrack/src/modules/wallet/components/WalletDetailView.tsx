import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
  type ScrollViewProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { SelectionBar } from "@/src/shared/components/SelectionBar";
import { toSelectionActions } from "@/src/shared/lib/menuActions";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import { FilterChipsRow } from "@/src/shared/components/FilterChipsRow";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import { COLORS } from "@/src/shared/constants";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useWalletItemFilters } from "@shared/modules/wallet/hooks/useWalletItemFilters";
import {
  WALLET_SOURCE_LABEL_KEY,
  WALLET_SOURCES,
  walletActLabelKey,
  walletSelectionItems,
  type WalletActionMode,
} from "@shared/modules/wallet/utils/walletView";
import { CollectionDetailSheet } from "@/src/modules/ledger/components/CollectionDetailSheet";
import type {
  UserWalletDetail,
  WalletItem,
  WalletSource,
} from "@shared/core/types";

const SOURCE_LOOK: Record<
  WalletSource,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  month: { icon: "card-outline", color: COLORS.primary, bg: "bg-indigo-50" },
  sale: { icon: "cube-outline", color: COLORS.success, bg: "bg-green-50" },
  manual: {
    icon: "document-text-outline",
    color: COLORS.warning,
    bg: "bg-amber-50",
  },
  mixed: { icon: "cash-outline", color: COLORS.success, bg: "bg-green-50" },
};

const keyOf = (it: WalletItem) => it.id;

// Gorhom's scroll view requires children; RN's ScrollView class cannot type it
type ScrollBody = ComponentType<ScrollViewProps & { children: ReactNode }>;

const PlainScroll: ScrollBody = (props) => <ScrollView {...props} />;

interface Props {
  detail: UserWalletDetail | null;
  loading: boolean;
  mode?: WalletActionMode;
  busy?: boolean;
  onActItems?: (items: WalletItem[]) => Promise<boolean>;
  onActAll?: () => void;
  Scroll?: ScrollBody;
}

// dual-context: a fixed-height sheet must pass Gorhom's scroll view (gotcha #47)
export function WalletDetailView({
  detail,
  loading,
  mode = "view",
  busy = false,
  onActItems,
  onActAll,
  Scroll = PlainScroll,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const target = useDisplayCurrency();

  const actionLabel = mode === "view" ? "" : t(walletActLabelKey(mode, false));
  const actionAllLabel = mode === "view" ? "" : t(walletActLabelKey(mode, true));
  const canAct = mode !== "view";

  const selection = useSelection();
  const selecting = canAct && selection.active;

  useSelectionBackHandler(selecting, selection.clear);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const allItems = detail?.items ?? [];
  const holderId = detail?.holderUserId ?? null;
  const filters = useWalletItemFilters(allItems, holderId);
  const filtered = filters.rows;

  const clearItemSelection = selection.clear;

  useEffect(() => {
    setFiltersOpen(false);
    clearItemSelection();
  }, [holderId, clearItemSelection]);

  const inOwnCurrency = (amount: number, currencyId: string | null) => {
    const cur = findCurrency(currencies, currencyId);
    return formatMoney(amount, cur, cur);
  };

  const customerOptions: DropdownOption<string>[] = filters.customers;

  const typeOptions: DropdownOption<WalletSource>[] = WALLET_SOURCES.map(
    (source) => ({ label: t(WALLET_SOURCE_LABEL_KEY[source]), value: source }),
  );

  async function act(items: WalletItem[]) {
    if (items.length === 0) return;
    const ok = await onActItems?.(items);
    if (ok) selection.clear();
  }

  const selectionActions = toSelectionActions(walletSelectionItems(mode), t, {
    icons: { details: "receipt-outline", act: "checkmark-done-outline" },
    run: {
      act: () =>
        void act(allItems.filter((it) => selection.isSelected(keyOf(it)))),
    },
    disabled: busy,
  });

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

      <Scroll
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 48,
        }}
      >
        <View className="items-center py-4">
          <Text className="text-xs text-gray-400 uppercase tracking-wide">
            {t("wallet.total_held")}
          </Text>
          <Text fontWeight="Bold" className="text-3xl text-gray-900 mt-1">
            {formatMoney(detail?.totalUsd ?? 0, null, target)}
          </Text>
        </View>

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
                <Text fontWeight="SemiBold" className="text-sm text-gray-900">
                  {inOwnCurrency(ct.amount, ct.currencyId)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {canAct && !selecting && !isEmpty ? (
          <PressableOpacity
            onPress={onActAll}
            disabled={busy}
            className={`flex-row items-center justify-center gap-2 rounded-xl py-3 mb-5 ${
              busy ? "bg-primary/60" : "bg-primary"
            }`}
          >
            <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
            <Text fontWeight="SemiBold" className="text-sm text-white">
              {actionAllLabel}
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
            {!selecting ? (
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  fontWeight="SemiBold"
                  className="text-xs text-gray-400 uppercase tracking-wide"
                >
                  {t("wallet.transactions_section")}
                </Text>
                <FilterToggleButton
                  active={filtersOpen}
                  hasActiveFilters={filters.active}
                  onPress={() => setFiltersOpen((v) => !v)}
                />
              </View>
            ) : null}

            {!selecting && filtersOpen ? (
              <FilterChipsRow inset={24} className="mb-3">
                {customerOptions.length > 0 ? (
                  <Dropdown<string>
                    placeholder={t("wallet.filter_by_customer")}
                    options={customerOptions}
                    value={filters.filter.customerId}
                    onChange={(customerId) => filters.set({ customerId })}
                    nullable
                    nullLabel={t("wallet.all_customers")}
                    triggerStyle="chip"
                    searchable
                  />
                ) : null}
                <Dropdown<WalletSource>
                  placeholder={t("wallet.filter_by_type")}
                  options={typeOptions}
                  value={filters.filter.source}
                  onChange={(source) => filters.set({ source })}
                  nullable
                  nullLabel={t("wallet.all_types")}
                  triggerStyle="chip"
                />
                <DatePickerInput
                  placeholder={t("wallet.date_from")}
                  value={filters.filter.fromDay ?? ""}
                  onChange={(v) => filters.set({ fromDay: v || null })}
                  maxDate={filters.filter.toDay ?? undefined}
                  triggerStyle="chip"
                  clearable
                />
                <DatePickerInput
                  placeholder={t("wallet.date_to")}
                  value={filters.filter.toDay ?? ""}
                  onChange={(v) => filters.set({ toDay: v || null })}
                  minDate={filters.filter.fromDay ?? undefined}
                  triggerStyle="chip"
                  clearable
                />
                {filters.active ? (
                  <PressableOpacity
                    onPress={filters.clear}
                    className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
                  >
                    <Ionicons name="close" size={14} color={COLORS.gray500} />
                    <Text fontWeight="Medium" className="text-sm text-gray-500">
                      {t("common.clear_filters")}
                    </Text>
                  </PressableOpacity>
                ) : null}
              </FilterChipsRow>
            ) : null}

            {filtered.length === 0 ? (
              <EmptyState
                message={t("wallet.filter_empty_title")}
                subMessage={t("wallet.filter_empty_desc")}
              />
            ) : (
              filtered.map((item) => {
                const look = SOURCE_LOOK[item.source];
                const k = keyOf(item);
                const checked = selection.isSelected(k);
                const subline = [
                  t(WALLET_SOURCE_LABEL_KEY[item.source]),
                  item.label,
                  formatDate(item.date),
                  item.collectorName
                    ? t("wallet.collected_by", { name: item.collectorName })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <EntityCard
                    key={k}
                    onPress={() => setDetailId(item.id)}
                    icon={look.icon}
                    iconColor={look.color}
                    iconBgClassName={look.bg}
                    selectionMode={selecting}
                    selected={checked}
                    onToggleSelect={() => selection.toggle(k)}
                    onEnterSelection={
                      canAct ? () => selection.enterWith(k) : undefined
                    }
                  >
                    <View className="flex-1">
                      <Text
                        fontWeight="SemiBold"
                        className="text-sm text-gray-900"
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
                      <Text
                        fontWeight="SemiBold"
                        className="text-sm text-gray-900"
                      >
                        {inOwnCurrency(item.amount, item.currencyId)}
                      </Text>
                      {canAct && !selecting ? (
                        <PressableOpacity
                          onPress={() => void act([item])}
                          disabled={busy}
                          hitSlop={6}
                          className="mt-1"
                        >
                          <Text
                            fontWeight="SemiBold"
                            className="text-xs text-primary"
                          >
                            {actionLabel}
                          </Text>
                        </PressableOpacity>
                      ) : null}
                    </View>
                  </EntityCard>
                );
              })
            )}
          </View>
        )}
      </Scroll>

      {detailId ? (
        <CollectionDetailSheet
          collectionId={detailId}
          onDismiss={() => setDetailId(null)}
        />
      ) : null}
    </View>
  );
}
