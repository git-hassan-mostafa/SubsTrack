import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, CARD_SURFACE } from "@/src/shared/constants";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import { useTenantSettingSlice } from "@/src/state/hooks/useTenantSettingSlice";
import { useWhatsAppSlice } from "@/src/state/hooks/useWhatsAppSlice";
import { WhatsAppConnectionSection } from "../components/WhatsAppConnectionSection";
import { WhatsAppLanguageSection } from "../components/WhatsAppLanguageSection";
import { WhatsAppTemplatesSection } from "../components/WhatsAppTemplatesSection";

export function WhatsAppSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const account = useWhatsAppSlice((s) => s.account);
  const error = useWhatsAppSlice((s) => s.error);
  const clearError = useWhatsAppSlice((s) => s.clearError);
  const fetchOverview = useWhatsAppSlice((s) => s.fetchOverview);
  const getSettings = useTenantSettingSlice((s) => s.getSettings);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getSettings();
      void fetchOverview();
    }, [getSettings, fetchOverview]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOverview();
    } finally {
      setRefreshing(false);
    }
  }, [fetchOverview]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("whatsapp.title")}
        showBack
        onBack={() => router.back()}
      />
      <ResponsiveContainer className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={COLORS.primary}
            />
          }
        >
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
          <WhatsAppConnectionSection />
          <WhatsAppLanguageSection />
          {account ? <WhatsAppTemplatesSection /> : null}
          <Pressable
            onPress={() => router.push("/(app)/(tabs)/admin/whatsapp-history" as Href)}
            className={`${CARD_SURFACE} p-4 mb-4 flex-row items-center justify-between`}
          >
            <View className="flex-row items-center gap-3">
              <Ionicons name="time-outline" size={20} color={COLORS.primary} />
              <Text fontWeight="Medium" className="text-sm text-gray-900">
                {t("whatsapp.history_title")}
              </Text>
            </View>
            <DirectionalIcon name="chevron-forward" size={18} color={COLORS.gray400} />
          </Pressable>
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
