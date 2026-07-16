import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/src/shared/components/EmptyState";

// Placeholder for the future Services feature (Transactions → Services tab).
export function ServicesPanel() {
  const { t } = useTranslation();
  return (
    <View className="flex-1">
      <EmptyState
        message={t("transactions.services_coming_soon")}
        subMessage={t("transactions.services_coming_soon_hint")}
      />
    </View>
  );
}
