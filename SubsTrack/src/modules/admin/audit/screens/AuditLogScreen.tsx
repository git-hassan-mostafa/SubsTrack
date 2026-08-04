import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import type { AuditAction, AuditEntry, AuditTable } from "@/src/core/types";
import { IS_OFFLINE_CAPABLE } from "@/src/core/offline";
import { COLORS } from "@/src/shared/constants";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { Dropdown, type DropdownOption } from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useAuditSlice } from "@/src/state/hooks/useAuditSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { AuditEntryCard } from "../components/AuditEntryCard";
import { AuditEntrySheet } from "../components/AuditEntrySheet";
import { AUDITED_TABLES } from "../utils/constants";
import { actionLabel, tableLabel } from "../utils/format";

const ACTIONS: AuditAction[] = ["create", "update", "delete", "void", "restore"];

/**
 * Admin screen: every change staff made — who, when, and what moved. Reads the
 * device's rolling 30-day window by default (so it works offline) and can switch
 * to the complete server-side history on demand.
 *
 * Admin-only is enforced by the audit_logs_select RLS policy, and the whole
 * admin tab is already hidden from non-admins, so there is no role check here.
 */
export function AuditLogScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const items = useAuditSlice((s) => s.items);
  const loading = useAuditSlice((s) => s.loading);
  const loadingMore = useAuditSlice((s) => s.loadingMore);
  const hasMore = useAuditSlice((s) => s.hasMore);
  const error = useAuditSlice((s) => s.error);
  const scope = useAuditSlice((s) => s.scope);
  const tableFilter = useAuditSlice((s) => s.tableFilter);
  const actionFilter = useAuditSlice((s) => s.actionFilter);
  const actorFilter = useAuditSlice((s) => s.actorFilter);
  const from = useAuditSlice((s) => s.from);
  const to = useAuditSlice((s) => s.to);
  const fetchEntries = useAuditSlice((s) => s.fetchEntries);
  const fetchMoreEntries = useAuditSlice((s) => s.fetchMoreEntries);
  const setScope = useAuditSlice((s) => s.setScope);
  const setTableFilter = useAuditSlice((s) => s.setTableFilter);
  const setActionFilter = useAuditSlice((s) => s.setActionFilter);
  const setActorFilter = useAuditSlice((s) => s.setActorFilter);
  const setFrom = useAuditSlice((s) => s.setFrom);
  const setTo = useAuditSlice((s) => s.setTo);
  const clearFilters = useAuditSlice((s) => s.clearFilters);
  const clearError = useAuditSlice((s) => s.clearError);

  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);

  const [openEntry, setOpenEntry] = useState<AuditEntry | null>(null);

  // The staff dropdown needs the user list; `getUsers` self-guards on its
  // `loaded` flag, so no length check here.
  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  // No branchFilter dependency, unlike the other admin lists: audit rows carry
  // their own denormalized branch_id and are scoped by the audit_logs_select RLS
  // policy, so there is no app-level branch filter to react to.
  useFocusEffect(
    useCallback(() => {
      void fetchEntries();
    }, [fetchEntries]),
  );

  const tableOptions: DropdownOption<string>[] = useMemo(
    () => AUDITED_TABLES.map((tbl) => ({ label: tableLabel(t, tbl), value: tbl })),
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

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <PageHeader
        title={t("audit.title")}
        showBack
        onBack={() => router.back()}
      />
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <ResponsiveContainer className="flex-1">
        {/* Filters — one horizontal chip row, bled to the screen edge. */}
        <View className="px-4 pt-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="-mx-4"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
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

        {/* The local window only exists on native; on web every query is server-side. */}
        {IS_OFFLINE_CAPABLE ? (
          <View className="px-5 pt-3">
            {scope === "full" ? (
              <Text className="text-xs text-gray-400">{t("audit.showing_full")}</Text>
            ) : (
              <View className="flex-row items-center flex-wrap gap-x-2">
                <Text className="text-xs text-gray-400">{t("audit.local_window_note")}</Text>
                <PressableOpacity onPress={() => void setScope("full")}>
                  <Text className="text-xs text-primary font-medium">
                    {t("audit.load_full")}
                  </Text>
                </PressableOpacity>
              </View>
            )}
          </View>
        ) : null}

        {loading && items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <AuditEntryCard entry={item} onPress={() => setOpenEntry(item)} />
            )}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 32,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void fetchEntries()}
                tintColor={COLORS.primary}
              />
            }
            onEndReached={() => {
              if (hasMore && !loadingMore) void fetchMoreEntries();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                message={t(
                  hasActiveFilters ? "audit.filter_empty_title" : "audit.empty_title",
                )}
                subMessage={t(
                  hasActiveFilters ? "audit.filter_empty_desc" : "audit.empty_desc",
                )}
              />
            }
          />
        )}
      </ResponsiveContainer>

      {openEntry ? (
        <AuditEntrySheet entry={openEntry} onDismiss={() => setOpenEntry(null)} />
      ) : null}
    </SafeAreaView>
  );
}
