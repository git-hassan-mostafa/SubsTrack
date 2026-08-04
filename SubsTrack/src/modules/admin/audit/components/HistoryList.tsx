import { useState, type ReactElement } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import type { AuditEntry } from "@/src/core/types";
import { IS_OFFLINE_CAPABLE } from "@/src/core/offline";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import type { AuditScope } from "@/src/state/slices/audit/auditSlice";
import { AuditEntryCard } from "./AuditEntryCard";
import { AuditEntrySheet } from "./AuditEntrySheet";

interface HistoryListProps {
  entries: AuditEntry[];
  loading: boolean;
  error?: string | null;
  onDismissError?: () => void;
  /** The device's 30-day window vs the full server history. Drives the scope note. */
  scope: AuditScope;
  /** Omit to hide the "Load full history" action (e.g. on web, where every read is server-side). */
  onLoadFull?: () => void;
  /** Pull-to-refresh. Omit inside a sheet — the gesture belongs to the sheet there. */
  onRefresh?: () => void;
  /** Omit for a non-paged list (one record's timeline is short by nature). */
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** Rendered above the list; use for filters. */
  header?: ReactElement;
  emptyTitle: string;
  emptyDescription: string;
  /**
   * Gorhom's list when inside a bottom sheet, RN's otherwise. A plain FlatList in a
   * sheet cannot scroll, and a Gorhom list outside one has no sheet to attach to.
   */
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
  scope,
  onLoadFull,
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
              <ScopeNote scope={scope} onLoadFull={onLoadFull} />
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
 * Explains that the list is the device's 30-day window, and offers the full server
 * history. Renders nothing on web, where there is no local window to explain.
 */
function ScopeNote({ scope, onLoadFull }: { scope: AuditScope; onLoadFull?: () => void }) {
  const { t } = useTranslation();
  if (!IS_OFFLINE_CAPABLE) return null;
  if (scope === "full") {
    return <Text className="text-xs text-gray-400 mb-3">{t("audit.showing_full")}</Text>;
  }
  return (
    <View className="mb-3">
      <Text className="text-xs text-gray-400">{t("audit.local_window_note")}</Text>
      {onLoadFull ? (
        <PressableOpacity onPress={onLoadFull} className="mt-1">
          <Text className="text-xs text-primary font-medium">{t("audit.load_full")}</Text>
        </PressableOpacity>
      ) : null}
    </View>
  );
}
