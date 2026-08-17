import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import { groupByMonth } from "@/src/shared/lib/monthSections";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useAuth } from "@/src/modules/authentication/auth";
import { confirm } from "@/src/shared/lib/confirm";
import type { ExpenseCategory, ExpenseItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useExpenseSlice } from "@/src/state/hooks/useExpenseSlice";
import { ExpenseCard } from "../components/ExpenseCard";
import { ExpenseFormSheet } from "../components/ExpenseFormSheet";
import { EXPENSE_CATEGORIES, STOCK_CATEGORY } from "../utils/expenseCategories";

/**
 * The Expenses segment of the Transactions hub — money OUT, admin-only.
 * One list merging both sources: hand-typed expenses and the derived cost of
 * stock bought in the window. Reads a date window (this month by default)
 * rather than paginating, so section totals are always the local sum.
 */
export function ExpensesPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const items = useExpenseSlice((s) => s.items);
  const summary = useExpenseSlice((s) => s.summary);
  const loading = useExpenseSlice((s) => s.loading);
  const error = useExpenseSlice((s) => s.error);
  const fromDate = useExpenseSlice((s) => s.fromDate);
  const toDate = useExpenseSlice((s) => s.toDate);
  const categoryFilter = useExpenseSlice((s) => s.categoryFilter);
  const fetchExpenses = useExpenseSlice((s) => s.fetchExpenses);
  const setDateRange = useExpenseSlice((s) => s.setDateRange);
  const setCategoryFilter = useExpenseSlice((s) => s.setCategoryFilter);
  const clearFilters = useExpenseSlice((s) => s.clearFilters);
  const voidExpense = useExpenseSlice((s) => s.voidExpense);
  const clearError = useExpenseSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    void fetchExpenses();
  }, [branchFilter, fetchExpenses]);

  const target = findCurrency(currencies, displayCurrencyId);

  // Search + category are client-side: the slice already holds the whole window.
  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return items.filter(
      (i) =>
        (categoryFilter === "all" || i.category === categoryFilter) &&
        (!q || i.label.toLowerCase().includes(q)),
    );
  }, [items, debouncedSearch, categoryFilter]);

  // The headline follows the filters, so it always matches the rows on screen.
  const visibleTotalUsd = useMemo(
    () => visible.reduce((s, i) => s + i.amount / i.ratePerUsdSnapshot, 0),
    [visible],
  );
  const filtered = visible.length !== items.length;

  const sections = useMemo(
    () =>
      groupByMonth(
        visible,
        (i) => i.date,
        t,
        (i) => i.amount / i.ratePerUsdSnapshot,
      ),
    [visible, t],
  );

  const categoryOptions = useMemo(
    () =>
      [...EXPENSE_CATEGORIES, STOCK_CATEGORY].map((c) => ({
        label: t(c.labelKey),
        value: c.code as ExpenseCategory,
      })),
    [t],
  );

  const hasActiveFilters = categoryFilter !== "all";

  async function handleVoid(item: ExpenseItem) {
    if (!user) return;
    const ok = await confirm({
      title: t("expenses.remove_title"),
      message: t("expenses.remove_message", { label: item.label }),
      confirmLabel: t("expenses.remove"),
      destructive: true,
    });
    if (!ok) return;
    // Strip the 'exp:' prefix the view model adds — the row id is what voids.
    await voidExpense(item.id.replace(/^exp:/, ""), user.id, null);
  }

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        {/* Total spent in the window — a leading minus, because every figure
            on this screen is money leaving. */}
        <View className="px-4 pt-3">
          <Text
            fontWeight="Bold"
            accessibilityLabel={t("expenses.total_spent")}
            className="text-2xl text-gray-900"
            numberOfLines={1}
          >
            {`−${formatMoney(filtered ? visibleTotalUsd : summary.totalUsd, null, target)}`}
          </Text>
          {!filtered && summary.stockUsd > 0 && summary.manualUsd > 0 ? (
            <Text className="text-xs text-gray-500 mt-0.5">
              {t("expenses.breakdown", {
                stock: formatMoney(summary.stockUsd, null, target),
                other: formatMoney(summary.manualUsd, null, target),
              })}
            </Text>
          ) : null}
        </View>

        <View className="px-4 pt-2 gap-y-2">
          <View className="flex-row items-center gap-x-2">
            <View className="flex-1">
              <SearchTextBox
                searchText={search}
                setSearchText={setSearch}
                placeholder={t("expenses.search_placeholder")}
              />
            </View>
            <FilterToggleButton
              active={filtersOpen}
              hasActiveFilters={hasActiveFilters}
              onPress={() => setFiltersOpen((v) => !v)}
            />
          </View>
          {filtersOpen ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              className="-mx-4"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              <Dropdown<ExpenseCategory>
                placeholder={t("expenses.filter_by_category")}
                options={categoryOptions}
                value={categoryFilter === "all" ? null : categoryFilter}
                onChange={(c) => setCategoryFilter(c ?? "all")}
                nullable
                nullLabel={t("expenses.all_categories")}
                triggerStyle="chip"
              />
              <DatePickerInput
                placeholder={t("expenses.date_from")}
                value={fromDate}
                onChange={(v) => void setDateRange(v, toDate)}
                maxDate={toDate}
                triggerStyle="chip"
              />
              <DatePickerInput
                placeholder={t("expenses.date_to")}
                value={toDate}
                onChange={(v) => void setDateRange(fromDate, v)}
                minDate={fromDate}
                triggerStyle="chip"
              />
              <PressableOpacity
                onPress={() => void clearFilters()}
                className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
              >
                <Ionicons name="close" size={14} color={COLORS.gray500} />
                <Text className="text-sm font-medium text-gray-500">
                  {t("common.clear_filters")}
                </Text>
              </PressableOpacity>
            </ScrollView>
          ) : null}
        </View>

        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {loading && items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(i) => i.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 96, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void fetchExpenses()}
                tintColor={COLORS.primary}
              />
            }
            renderSectionHeader={({ section }) => (
              <MonthSectionHeader
                title={section.title}
                count={section.data.length}
                first={section.key === sections[0]?.key}
                total={`−${formatMoney(section.totalUsd ?? 0, null, target)}`}
              />
            )}
            renderItem={({ item }) => (
              <ExpenseCard
                item={item}
                onVoid={handleVoid}
                onOpenProduct={() => router.push("/(app)/(tabs)/admin/products")}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                message={t("expenses.no_expenses")}
                subMessage={t("expenses.no_expenses_hint")}
              />
            }
          />
        )}

        <FAB onPress={() => setFormOpen(true)} accessibilityLabel={t("expenses.add_title")} />
      </ResponsiveContainer>

      {formOpen && <ExpenseFormSheet onDismiss={() => setFormOpen(false)} />}
    </View>
  );
}
