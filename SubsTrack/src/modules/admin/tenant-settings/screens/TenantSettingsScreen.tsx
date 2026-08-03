import { useEffect } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useTenantSettingSlice } from "@/src/state/hooks/useTenantSettingSlice";
import { DisplayCurrencySection } from "../components/DisplayCurrencySection";
import { UnpaidRuleSection } from "../components/UnpaidRuleSection";

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthSlice((s) => s.user);
  const getSettings = useTenantSettingSlice((s) => s.getSettings);
  const error = useTenantSettingSlice((s) => s.error);
  const clearError = useTenantSettingSlice((s) => s.clearError);

  useEffect(() => {
    void getSettings();
  }, [getSettings]);

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
        >
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
          <DisplayCurrencySection />
          <UnpaidRuleSection />
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
