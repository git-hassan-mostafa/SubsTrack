import { useCallback } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import type { WhatsAppMessage } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import { Chip } from "@/src/shared/components/Chip";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { PillTabs } from "@/src/shared/components/PillTabs";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { confirm } from "@shared/shared/lib/confirm";
import { useMessageHistoryStore } from "@shared/modules/whatsapp/state/messageHistoryStore";
import {
  HISTORY_STATUS_FILTERS,
  type HistoryStatusFilter,
} from "@shared/modules/whatsapp/utils/constants";
import { whatsAppMessageItems } from "@shared/modules/whatsapp/utils/whatsappMenu";
import {
  cancelBatchConfirm,
  historyFilterLabel,
  messageCustomerName,
  messageErrorText,
  messageStatusLabel,
  messageStatusTone,
  messageTitle,
} from "@shared/modules/whatsapp/utils/whatsappView";

function MessageCard({
  message,
  onCancel,
}: {
  message: WhatsAppMessage;
  onCancel: (batchId: string) => void;
}) {
  const { t } = useTranslation();
  const errorText = messageErrorText(message, t);
  return (
    <View className={`${CARD_SURFACE} p-4 mb-3`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text fontWeight="SemiBold" className="flex-1 text-sm text-gray-900">
          {messageCustomerName(message, t)}
        </Text>
        <Chip
          text={messageStatusLabel(message.status, t)}
          tone={messageStatusTone(message.status)}
        />
      </View>
      <Text className="text-xs text-gray-500 mt-1">
        {`${messageTitle(message, t)} · ${formatDateTime(message.createdAt)}`}
      </Text>
      {errorText ? (
        <Text className="text-xs text-red-600 mt-2">{errorText}</Text>
      ) : null}
      {whatsAppMessageItems(message).map((item) => (
        <PressableOpacity key={item.key} onPress={() => onCancel(message.batchId)} className="mt-2">
          <Text className="text-xs text-primary">{t(item.labelKey)}</Text>
        </PressableOpacity>
      ))}
    </View>
  );
}

export function WhatsAppHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = useMessageHistoryStore((s) => s.items);
  const status = useMessageHistoryStore((s) => s.status);
  const loading = useMessageHistoryStore((s) => s.loading);
  const loadingMore = useMessageHistoryStore((s) => s.loadingMore);
  const error = useMessageHistoryStore((s) => s.error);
  const fetchMessages = useMessageHistoryStore((s) => s.fetchMessages);
  const loadMore = useMessageHistoryStore((s) => s.loadMore);
  const setStatus = useMessageHistoryStore((s) => s.setStatus);
  const cancelBatch = useMessageHistoryStore((s) => s.cancelBatch);
  const clearError = useMessageHistoryStore((s) => s.clearError);

  useFocusEffect(
    useCallback(() => {
      void fetchMessages();
    }, [fetchMessages]),
  );

  async function handleCancel(batchId: string) {
    if (await confirm(cancelBatchConfirm(t))) await cancelBatch(batchId);
  }

  const tabs = HISTORY_STATUS_FILTERS.map((key) => ({
    key,
    label: historyFilterLabel(key, t),
  }));

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("whatsapp.history_title")}
        showBack
        onBack={() => router.back()}
      />
      <ResponsiveContainer className="flex-1">
        <View className="px-4 pt-3">
          <PillTabs<HistoryStatusFilter>
            value={status ?? "all"}
            onChange={(value) => void setStatus(value === "all" ? null : value)}
            tabs={tabs}
          />
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <MessageCard message={item} onCancel={(id) => void handleCancel(id)} />
          )}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void fetchMessages()}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            loading ? null : <EmptyState message={t("whatsapp.history_empty")} />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={COLORS.primary} /> : null
          }
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
