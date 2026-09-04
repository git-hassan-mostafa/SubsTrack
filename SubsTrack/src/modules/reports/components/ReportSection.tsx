import type { ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";

interface Props {
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  onRefresh: () => void;
  empty?: boolean;
  emptyMessage?: string;
  emptySubMessage?: string;
  children: ReactNode;
}

/**
 * The loading / error / empty / pull-to-refresh shell every report section
 * sits in. A section only supplies its cards; it never re-decides what an empty
 * period looks like.
 */
export function ReportSection({
  loading,
  error,
  onClearError,
  onRefresh,
  empty,
  emptyMessage,
  emptySubMessage,
  children,
}: Props) {
  const { t } = useTranslation();

  if (loading && !error) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="pb-24"
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      <ResponsiveContainer>
        {error ? (
          <View className="px-4 pt-3">
            <ErrorBanner message={error} onDismiss={onClearError} />
          </View>
        ) : null}
        {empty ? (
          <EmptyState
            message={emptyMessage ?? t("reports.empty")}
            subMessage={emptySubMessage ?? t("reports.empty_hint")}
          />
        ) : (
          <View className="px-4 pt-3 gap-3">{children}</View>
        )}
      </ResponsiveContainer>
    </ScrollView>
  );
}
