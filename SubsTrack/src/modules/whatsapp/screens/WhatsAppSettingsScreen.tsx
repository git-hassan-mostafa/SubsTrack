import { useCallback, useEffect, useState } from "react";
import { AppState, RefreshControl, ScrollView } from "react-native";
import { Screen } from "@/src/shared/components/Screen";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ListGroup } from "@/src/shared/components/ListGroup";
import { ListRow } from "@/src/shared/components/ListRow";
import { useTenantSettingSlice } from "@shared/state/hooks/useTenantSettingSlice";
import { useWhatsAppSlice } from "@shared/state/hooks/useWhatsAppSlice";
import { WhatsAppConnectionSection } from "../components/WhatsAppConnectionSection";
import { WhatsAppLanguageSection } from "../components/WhatsAppLanguageSection";
import { WhatsAppTemplatesSection } from "../components/WhatsAppTemplatesSection";

// Connecting ends in the browser, so coming back to the app refetches.
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

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void fetchOverview();
    });
    return () => subscription.remove();
  }, [fetchOverview]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOverview();
    } finally {
      setRefreshing(false);
    }
  }, [fetchOverview]);

  return (
    <Screen>
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
          <ListGroup className="mb-4">
            <ListRow
              icon="time-outline"
              title={t("whatsapp.history_title")}
              onPress={() =>
                router.push("/(app)/(tabs)/more/whatsapp-history" as Href)
              }
            />
          </ListGroup>
        </ScrollView>
      </ResponsiveContainer>
    </Screen>
  );
}
