import { useState, type ReactElement } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import type { AuditEntry, AuditSource } from "@/src/core/types";
import { IS_OFFLINE_CAPABLE } from "@/src/core/offline";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { AuditEntryCard } from "./AuditEntryCard";
import { AuditEntrySheet } from "./AuditEntrySheet";

interface HistoryListProps {
  entries: AuditEntry[];
  loading: boolean;
  error?: string | null;
  onDismissError?: () => void;
  source: AuditSource;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  header?: ReactElement;
  emptyTitle: string;
  emptyDescription: string;
  inSheet?: boolean;
}

/**
 * The audit trail rendered as a list — shared by the admin Audit Log screen and the
 * per-record History sheet, which differ only in what they feed it.
 *
 * Deliberately presentational: it fetches nothing and owns no query state, so the
 * caller decides where entries come from (the slice's filter session for the admin
 * screen, a local hook for one record). The only state it keeps is which entry the
 * user tapped open, which no caller needs to know about.
 */
export function HistoryList({
  entries,
  loading,
  error,
  onDismissError,
  source,
  onRefresh,
  onLoadMore,
  loadingMore = false,
  header,
  emptyTitle,
  emptyDescription,
  inSheet = false,
}: HistoryListProps) {
  const [openEntry, setOpenEntry] = useState<AuditEntry | null>(null);

  const List = inSheet ? BottomSheetFlatList : FlatList;

  return (
    <>
      {error ? <ErrorBanner message={error} onDismiss={onDismissError} /> : null}

      {loading && entries.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <List
          data={entries}
          keyExtractor={(e: AuditEntry) => e.id}
          renderItem={({ item }: { item: AuditEntry }) => (
            <AuditEntryCard entry={item} onPress={() => setOpenEntry(item)} />
          )}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <>
              {header}
              <SourceNote source={source} />
            </>
          }
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={loading}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            ) : undefined
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState message={emptyTitle} subMessage={emptyDescription} />
          }
        />
      )}

      {openEntry ? (
        <AuditEntrySheet entry={openEntry} onDismiss={() => setOpenEntry(null)} />
      ) : null}
    </>
  );
}

/**
 * Says which trail is on screen — the full server history, or the device's 30-day
 * window when the server could not be reached. Informational only: there is no
 * action, because the server read is already the default. Renders nothing on web,
 * where there is no local window and so nothing to distinguish.
 */
function SourceNote({ source }: { source: AuditSource }) {
  const { t } = useTranslation();
  if (!IS_OFFLINE_CAPABLE) return null;
  return (
    <Text className="text-xs text-gray-400 mb-3">
      {t(source === "server" ? "audit.showing_full" : "audit.local_window_note")}
    </Text>
  );
}
