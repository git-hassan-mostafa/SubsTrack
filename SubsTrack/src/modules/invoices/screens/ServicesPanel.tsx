import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/src/shared/components/EmptyState";

// Placeholder for the future Services feature (Invoices → Services tab).
export function ServicesPanel() {
  const { t } = useTranslation();
  return (
    <View className="flex-1">
      <EmptyState
        message={t("invoices.services_coming_soon")}
        subMessage={t("invoices.services_coming_soon_hint")}
      />
    </View>
  );
}
