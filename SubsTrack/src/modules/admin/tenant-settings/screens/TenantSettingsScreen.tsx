import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { DisplayCurrencySection } from "../components/DisplayCurrencySection";

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthSlice((s) => s.user);

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
          <DisplayCurrencySection />
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
