import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useBillingSlice } from "@/src/state/hooks/useBillingSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useTenantSettingSlice } from "@/src/state/hooks/useTenantSettingSlice";
import { CustomerAllowanceSection } from "@/src/modules/admin/billing";
import { DisplayCurrencySection } from "../components/DisplayCurrencySection";
import { UnpaidRuleSection } from "../components/UnpaidRuleSection";

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthSlice((s) => s.user);
  const getSettings = useTenantSettingSlice((s) => s.getSettings);
  const fetchSettings = useTenantSettingSlice((s) => s.fetchSettings);
  const error = useTenantSettingSlice((s) => s.error);
  const clearError = useTenantSettingSlice((s) => s.clearError);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const fetchCurrencies = useCurrencySlice((s) => s.fetchCurrencies);
  const refreshCounts = useBillingSlice((s) => s.refreshCounts);
  const refreshRequest = useBillingSlice((s) => s.refreshRequest);
  const [refreshing, setRefreshing] = useState(false);

  const tenantId = user?.tenantId;

  useEffect(() => {
    void getSettings();
    void getCurrencies();
  }, [getSettings, getCurrencies]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchSettings(),
        fetchCurrencies(),
        refreshCounts(),
        tenantId ? refreshRequest(tenantId) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchSettings, fetchCurrencies, refreshCounts, refreshRequest, tenantId]);

  if (!user) return null;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("tenant_settings.title")}
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
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}
          <CustomerAllowanceSection />
          <DisplayCurrencySection />
          <UnpaidRuleSection />
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
