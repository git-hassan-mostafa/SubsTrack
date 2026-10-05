import { useMemo, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  View,
  type ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import { FilterChipsRow } from "@/src/shared/components/FilterChipsRow";
import { groupByMonth } from "@shared/shared/lib/monthSections";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import type { ExpenseCategory } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { outflowLabel } from "@shared/modules/transaction/expenses/utils/outflow";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useExpensesList } from "@shared/modules/transaction/expenses/hooks/useExpensesList";
import { ExpenseCard } from "../components/ExpenseCard";
import { ExpenseFormSheet } from "../components/ExpenseFormSheet";
import { EXPENSE_FILTER_CATEGORIES } from "@shared/modules/transaction/expenses/utils/expenseCategories";

interface Props {
  filterRowRef?: RefObject<ScrollView | null>;
}

// Money OUT, admin-only: a date window (this month by default), not paged.
export function ExpensesPanel({ filterRowRef }: Props = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const list = useExpensesList(debouncedSearch);
  const { period, setPeriod } = list;
  const target = useDisplayCurrency();

  const sections = useMemo(
    () =>
      groupByMonth(
        list.rows,
        (i) => i.date,
        t,
        (i) => i.amount / i.ratePerUsdSnapshot,
      ),
    [list.rows, t],
  );

  const categoryOptions = useMemo(
    () =>
      EXPENSE_FILTER_CATEGORIES.map((c) => ({
        label: t(c.labelKey),
        value: c.code,
      })),
    [t],
  );

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        <View className="px-4 pt-3">
          <Text
            fontWeight="Bold"
            accessibilityLabel={t("expenses.total_spent")}
            className="text-2xl text-gray-900"
            numberOfLines={1}
          >
            {outflowLabel(list.totalUsd, null, target)}
          </Text>
          {list.breakdown ? (
            <Text className="text-xs text-gray-500 mt-0.5">
              {t("expenses.breakdown", {
                stock: formatMoney(list.breakdown.stockUsd, null, target),
                other: formatMoney(list.breakdown.manualUsd, null, target),
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
              hasActiveFilters={list.hasActiveFilters}
              onPress={() => setFiltersOpen((v) => !v)}
            />
          </View>
          {filtersOpen ? (
            <FilterChipsRow scrollRef={filterRowRef}>
              <Dropdown<ExpenseCategory>
                placeholder={t("expenses.filter_by_category")}
                options={categoryOptions}
                value={list.category === "all" ? null : list.category}
                onChange={(c) => list.setCategory(c ?? "all")}
                nullable
                nullLabel={t("expenses.all_categories")}
                triggerStyle="chip"
                searchable
              />
              <DatePickerInput
                placeholder={t("expenses.date_from")}
                value={period.fromDate}
                onChange={(fromDate) =>
                  void setPeriod({ ...period, preset: "custom", fromDate })
                }
                maxDate={period.toDate}
                triggerStyle="chip"
              />
              <DatePickerInput
                placeholder={t("expenses.date_to")}
                value={period.toDate}
                onChange={(toDate) =>
                  void setPeriod({ ...period, preset: "custom", toDate })
                }
                minDate={period.fromDate}
                triggerStyle="chip"
              />
              <PressableOpacity
                onPress={() => void list.clearFilters()}
                className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
              >
                <Ionicons name="close" size={14} color={COLORS.gray500} />
                <Text fontWeight="Medium" className="text-sm text-gray-500">
                  {t("common.clear_filters")}
                </Text>
              </PressableOpacity>
            </FilterChipsRow>
          ) : null}
        </View>

        {list.error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={list.error} onDismiss={list.clearError} />
          </View>
        ) : null}

        {list.loading && !list.loaded ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(i) => i.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 96,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={list.loading}
                onRefresh={() => void list.reload()}
                tintColor={COLORS.primary}
              />
            }
            renderSectionHeader={({ section }) => (
              <MonthSectionHeader
                title={section.title}
                count={section.data.length}
                first={section.key === sections[0]?.key}
                total={outflowLabel(section.totalUsd ?? 0, null, target)}
              />
            )}
            renderItem={({ item }) => (
              <ExpenseCard
                item={item}
                onVoid={(expense) => void list.remove(expense)}
                onOpenProduct={() =>
                  router.push("/(app)/(tabs)/admin/products")
                }
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

        <FAB
          onPress={() => setFormOpen(true)}
          accessibilityLabel={t("expenses.add_title")}
        />
      </ResponsiveContainer>

      {formOpen && <ExpenseFormSheet onDismiss={() => setFormOpen(false)} />}
    </View>
  );
}
