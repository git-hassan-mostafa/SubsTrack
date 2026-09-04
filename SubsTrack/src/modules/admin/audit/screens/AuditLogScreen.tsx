import { useEffect, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { AuditAction, AuditTable } from "@/src/core/types";
import { COLORS } from "@/src/shared/constants";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useAuditStore } from "@/src/modules/admin/audit/state/auditStore";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { HistoryList } from "../components/HistoryList";
import { AUDITED_TABLES } from "../utils/constants";
import { actionLabel, tableLabel } from "../utils/format";

const ACTIONS: AuditAction[] = [
  "create",
  "update",
  "delete",
  "void",
  "restore",
];

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

  // The staff dropdown needs the user list; `getUsers` self-guards on its
  // `loaded` flag, so no length check here.
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
    () => ACTIONS.map((a) => ({ label: actionLabel(t, a), value: a })),
    [t],
  );
  const actorOptions: DropdownOption<string>[] = useMemo(
    () => users.map((u) => ({ label: u.fullName, value: u.id })),
    [users],
  );

  const hasActiveFilters =
    !!tableFilter || !!actionFilter || !!actorFilter || !!from || !!to;

  // Passed to HistoryList as its header so the chips scroll with the entries —
  // a fixed filter bar would eat vertical space on a phone.
  const filters = (
    <View className="-mx-4 mb-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 8,
          alignItems: "center",
        }}
      >
        <Dropdown<string>
          placeholder={t("audit.filter_by_table")}
          options={tableOptions}
          value={tableFilter}
          onChange={(v) => setTableFilter(v as AuditTable | null)}
          nullable
          nullLabel={t("audit.all_tables")}
          triggerStyle="chip"
        />
        <Dropdown<string>
          placeholder={t("audit.filter_by_action")}
          options={actionOptions}
          value={actionFilter}
          onChange={(v) => setActionFilter(v as AuditAction | null)}
          nullable
          nullLabel={t("audit.all_actions")}
          triggerStyle="chip"
        />
        <Dropdown<string>
          placeholder={t("audit.filter_by_actor")}
          options={actorOptions}
          value={actorFilter}
          onChange={(v) => setActorFilter(v)}
          nullable
          nullLabel={t("audit.all_actors")}
          triggerStyle="chip"
        />
        <DatePickerInput
          placeholder={t("audit.date_from")}
          value={from ?? ""}
          onChange={(v) => void setFrom(v || null)}
          maxDate={to ?? undefined}
          triggerStyle="chip"
          clearable
        />
        <DatePickerInput
          placeholder={t("audit.date_to")}
          value={to ?? ""}
          onChange={(v) => void setTo(v || null)}
          minDate={from ?? undefined}
          triggerStyle="chip"
          clearable
        />
        {hasActiveFilters ? (
          <PressableOpacity
            onPress={() => void clearFilters()}
            className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
          >
            <Ionicons name="close" size={14} color={COLORS.gray500} />
            <Text className="text-sm font-medium text-gray-500">
              {t("audit.clear_filters")}
            </Text>
          </PressableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <PageHeader
        title={t("audit.title")}
        showBack
        onBack={() => router.back()}
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
          header={filters}
          emptyTitle={t(
            hasActiveFilters ? "audit.filter_empty_title" : "audit.empty_title",
          )}
          emptyDescription={t(
            hasActiveFilters ? "audit.filter_empty_desc" : "audit.empty_desc",
          )}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
