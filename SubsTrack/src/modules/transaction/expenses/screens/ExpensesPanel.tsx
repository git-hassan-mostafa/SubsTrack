import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { FilterRow } from "@/src/shared/components/FilterRow";
import type { RenderPageHeader } from "@/src/shared/components/PageHeader";
import { groupByMonth } from "@shared/shared/lib/monthSections";
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
import { KEYBOARD_SAFE_LIST } from "@/src/shared/lib/keyboardSafeList";

interface Props {
  header: RenderPageHeader;
}

// Money OUT, admin-only: a date window (this month by default), not paged.
export function ExpensesPanel({ header }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
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
      {header({
        search: {
          value: search,
          onChange: setSearch,
          placeholder: t("expenses.search_placeholder"),
        },
        filters: {
          active: list.hasActiveFilters,
          onClear: () => void list.clearFilters(),
          children: (
            <>
              <FilterRow label={t("expenses.filter_by_category")}>
                <Dropdown<ExpenseCategory>
                  label={t("expenses.filter_by_category")}
                  options={categoryOptions}
                  value={list.category === "all" ? null : list.category}
                  onChange={(c) => list.setCategory(c ?? "all")}
                  nullable
                  nullLabel={t("expenses.all_categories")}
                  triggerStyle="filter"
                  searchable
                />
              </FilterRow>
              <FilterRow label={t("filters.date")}>
                <DatePickerInput
                  label={t("filters.from")}
                  value={period.fromDate}
                  onChange={(fromDate) =>
                    void setPeriod({ ...period, preset: "custom", fromDate })
                  }
                  maxDate={period.toDate}
                  triggerStyle="filter"
                />
                <DatePickerInput
                  label={t("filters.to")}
                  value={period.toDate}
                  onChange={(toDate) =>
                    void setPeriod({ ...period, preset: "custom", toDate })
                  }
                  minDate={period.fromDate}
                  triggerStyle="filter"
                />
              </FilterRow>
            </>
          ),
        },
      })}
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
            {...KEYBOARD_SAFE_LIST}
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
