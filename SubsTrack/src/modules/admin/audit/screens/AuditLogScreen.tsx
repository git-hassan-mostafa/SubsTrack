import { useCallback, useEffect, useMemo } from "react";
import { Screen } from "@/src/shared/components/Screen";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { AuditAction, AuditTable } from "@shared/core/types";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { FilterRow } from "@/src/shared/components/FilterRow";
import { useAuditStore } from "@shared/modules/admin/audit/state/auditStore";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { loadAllPages } from "@shared/shared/hooks/loadAllPages";
import { currentMonthDays } from "@shared/core/utils/dateRange";
import { showsOlderThanThisMonth } from "@shared/modules/admin/audit/utils/exportWindow";
import { HistoryList } from "../components/HistoryList";
import { AUDITED_TABLES } from "@shared/modules/admin/audit/utils/constants";
import { AUDIT_ACTIONS } from "@shared/modules/admin/audit/utils/filter";
import { actionLabel, tableLabel } from "@shared/modules/admin/audit/utils/format";

/**
 * Admin screen: every change staff made — who, when, and what moved. Reads the
 * complete server history straight away, with this device's un-pushed entries
 * merged in, and falls back to the local 30-day window with no connection.
 *
 * Admin-only is enforced by the audit_logs_select RLS policy, and the whole
 * admin tab is already hidden from non-admins, so there is no role check here.
 */
export function AuditLogScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const items = useAuditStore((s) => s.items);
  const loading = useAuditStore((s) => s.loading);
  const loadingMore = useAuditStore((s) => s.loadingMore);
  const hasMore = useAuditStore((s) => s.hasMore);
  const error = useAuditStore((s) => s.error);
  const source = useAuditStore((s) => s.source);
  const tableFilter = useAuditStore((s) => s.tableFilter);
  const actionFilter = useAuditStore((s) => s.actionFilter);
  const actorFilter = useAuditStore((s) => s.actorFilter);
  const from = useAuditStore((s) => s.from);
  const to = useAuditStore((s) => s.to);
  const fetchEntries = useAuditStore((s) => s.fetchEntries);
  const refetchForBranch = useAuditStore((s) => s.refetchForBranch);
  const fetchMoreEntries = useAuditStore((s) => s.fetchMoreEntries);
  const setTableFilter = useAuditStore((s) => s.setTableFilter);
  const setActionFilter = useAuditStore((s) => s.setActionFilter);
  const setActorFilter = useAuditStore((s) => s.setActorFilter);
  const setFrom = useAuditStore((s) => s.setFrom);
  const setTo = useAuditStore((s) => s.setTo);
  const clearFilters = useAuditStore((s) => s.clearFilters);
  const clearError = useAuditStore((s) => s.clearError);

  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const branchFilter = useEffectiveBranchFilter();
  // The trail has no natural end, so the most an export offers to fetch is THIS
  // MONTH. Once scrolling has already pulled in something older, the screen is
  // showing more than that anyway — so there is nothing left to offer and the
  // export simply takes what is on screen.
  const loadThisMonth = useCallback(async () => {
    const { fromDate, toDate } = currentMonthDays();
    await setFrom(fromDate);
    await setTo(toDate);
    return loadAllPages(
      () => useAuditStore.getState().items,
      () => useAuditStore.getState().hasMore,
      fetchMoreEntries,
    );
  }, [setFrom, setTo, fetchMoreEntries]);

  const { iconActions: exportIconActions, exportSheet } = useExportRows(
    "audit.title",
    items,
    showsOlderThanThisMonth(items)
      ? {}
      : {
          loadMore: {
            hasMore,
            loadAll: loadThisMonth,
            allLabelKey: "export.this_month",
            allHintKey: "export.this_month_hint",
          },
        },
  );

  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  useEffect(() => {
    void refetchForBranch();
  }, [branchFilter, refetchForBranch]);

  const tableOptions: DropdownOption<string>[] = useMemo(
    () =>
      AUDITED_TABLES.map((tbl) => ({ label: tableLabel(t, tbl), value: tbl })),
    [t],
  );
  const actionOptions: DropdownOption<string>[] = useMemo(
    () => AUDIT_ACTIONS.map((a) => ({ label: actionLabel(t, a), value: a })),
    [t],
  );
  const actorOptions: DropdownOption<string>[] = useMemo(
    () => users.map((u) => ({ label: u.fullName, value: u.id })),
    [users],
  );

  const hasActiveFilters =
    !!tableFilter || !!actionFilter || !!actorFilter || !!from || !!to;

  const filterFields = (
    <>
      <FilterRow label={t("audit.filter_by_table")}>
        <Dropdown<string>
          label={t("audit.filter_by_table")}
          options={tableOptions}
          value={tableFilter}
          onChange={(v) => setTableFilter(v as AuditTable | null)}
          nullable
          nullLabel={t("audit.all_tables")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("audit.filter_by_action")}>
        <Dropdown<string>
          label={t("audit.filter_by_action")}
          options={actionOptions}
          value={actionFilter}
          onChange={(v) => setActionFilter(v as AuditAction | null)}
          nullable
          nullLabel={t("audit.all_actions")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("audit.filter_by_actor")}>
        <Dropdown<string>
          label={t("audit.filter_by_actor")}
          options={actorOptions}
          value={actorFilter}
          onChange={(v) => setActorFilter(v)}
          nullable
          nullLabel={t("audit.all_actors")}
          triggerStyle="filter"
          searchable
        />
      </FilterRow>
      <FilterRow label={t("filters.date")}>
        <DatePickerInput
          label={t("filters.from")}
          value={from ?? ""}
          onChange={(v) => void setFrom(v || null)}
          maxDate={to ?? undefined}
          triggerStyle="filter"
          clearable
        />
        <DatePickerInput
          label={t("filters.to")}
          value={to ?? ""}
          onChange={(v) => void setTo(v || null)}
          minDate={from ?? undefined}
          triggerStyle="filter"
          clearable
        />
      </FilterRow>
    </>
  );

  return (
    <Screen edges={[]}>
      <PageHeader
        title={t("audit.title")}
        showBack
        onBack={() => router.back()}
        iconActions={exportIconActions}
        filters={{
          active: hasActiveFilters,
          onClear: () => void clearFilters(),
          children: filterFields,
        }}
      />

      <ResponsiveContainer className="flex-1">
        <HistoryList
          entries={items}
          loading={loading}
          error={error}
          onDismissError={clearError}
          source={source}
          onRefresh={() => void fetchEntries()}
          onLoadMore={() => {
            if (hasMore && !loadingMore) void fetchMoreEntries();
          }}
          loadingMore={loadingMore}
          emptyTitle={t(
            hasActiveFilters ? "audit.filter_empty_title" : "audit.empty_title",
          )}
          emptyDescription={t(
            hasActiveFilters ? "audit.filter_empty_desc" : "audit.empty_desc",
          )}
        />
      </ResponsiveContainer>
      {exportSheet}
    </Screen>
  );
}
