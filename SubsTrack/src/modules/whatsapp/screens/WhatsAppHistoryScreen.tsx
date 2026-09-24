import { useCallback } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import type { WhatsAppMessage, WhatsAppMessageStatus } from "@/src/core/types";
import { formatDateTime } from "@/src/core/utils/date";
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { PillTabs } from "@/src/shared/components/PillTabs";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import { useMessageHistoryStore } from "../state/messageHistoryStore";
import { HISTORY_STATUS_FILTERS } from "../utils/constants";
import { sijilTemplateByName } from "@/supabase/functions/_shared/whatsapp/sijilTemplates";

type Filter = WhatsAppMessageStatus | "all";

const STATUS_TONES: Record<WhatsAppMessageStatus, ChipTone> = {
  queued: "gray",
  sending: "gray",
  unknown: "orange",
  accepted: "sky",
  sent: "sky",
  delivered: "indigo",
  read: "emerald",
  failed: "red",
  cancelled: "gray",
};

function MessageCard({
  message,
  onCancel,
}: {
  message: WhatsAppMessage;
  onCancel: (batchId: string) => void;
}) {
  const { t } = useTranslation();
  const sijil = sijilTemplateByName(message.templateName);
  const title = sijil
    ? t(`whatsapp.purpose.${sijil.purpose}`)
    : message.templateName;
  return (
    <View className={`${CARD_SURFACE} p-4 mb-3`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text fontWeight="SemiBold" className="flex-1 text-sm text-gray-900">
          {message.customerName ?? t("whatsapp.unknown_customer")}
        </Text>
        <Chip
          text={t(`whatsapp.message_status.${message.status}`)}
          tone={STATUS_TONES[message.status] ?? "gray"}
        />
      </View>
      <Text className="text-xs text-gray-500 mt-1">
        {`${title} · ${formatDateTime(message.createdAt)}`}
      </Text>
      {message.errorKey ? (
        <Text className="text-xs text-red-600 mt-2">
          {t(`whatsapp.message_error.${message.errorKey}`, {
            defaultValue: message.errorTitle ?? t("whatsapp.message_error.meta_error"),
          })}
        </Text>
      ) : null}
      {message.status === "queued" ? (
        <PressableOpacity onPress={() => onCancel(message.batchId)} className="mt-2">
          <Text className="text-xs text-primary">{t("whatsapp.cancel_batch")}</Text>
        </PressableOpacity>
      ) : null}
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
    const agreed = await confirm({
      title: t("whatsapp.cancel_batch"),
      message: t("whatsapp.cancel_batch_confirm"),
      confirmLabel: t("whatsapp.cancel_batch"),
      destructive: true,
    });
    if (agreed) await cancelBatch(batchId);
  }

  const tabs = HISTORY_STATUS_FILTERS.map((key) => ({
    key,
    label: t(key === "all" ? "whatsapp.filter_all" : `whatsapp.message_status.${key}`),
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
          <PillTabs<Filter>
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
