import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { formatMoney } from "@shared/core/utils/currency";
import { useBillingContact } from "@shared/modules/admin/billing/hooks/useBillingContact";
import { usePricePackages } from "@shared/modules/admin/billing/hooks/usePricePackages";
import { MAX_SELF_SERVE_PLANS } from "@shared/modules/admin/billing/utils/types";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";

// Hidden without a support number: every package is asked for on WhatsApp.
export function PackagesSection() {
  const { t } = useTranslation();
  const packages = usePricePackages();
  const { canContact, askPackage } = useBillingContact(openWhatsApp);

  if (!canContact) return null;

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <SectionLabel className="mb-1">{t("billing.packages_title")}</SectionLabel>
      <Text className="text-xs text-gray-500 mb-1">
        {t("billing.packages_hint", { max: MAX_SELF_SERVE_PLANS })}
      </Text>
      {packages.map((pkg) => (
        <PressableOpacity
          key={pkg.size}
          onPress={() => askPackage(pkg)}
          disabled={pkg.current}
          containerClassName="border border-gray-200 rounded-xl mt-2"
          className="flex-row items-center px-4 py-3"
        >
          <View className="flex-1 pe-3">
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
              {t("billing.current_limits_value", {
                customers: pkg.size,
                plans: pkg.size,
              })}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              {pkg.priceUsd == null
                ? t("billing.package_ask_price")
                : t("billing.package_price", {
                    price: formatMoney(pkg.priceUsd, null, null),
                  })}
            </Text>
          </View>
          {pkg.current ? (
            <View className="bg-primary-container rounded-full px-2.5 py-1">
              <Text fontWeight="SemiBold" className="text-xs text-primary">
                {t("billing.package_current")}
              </Text>
            </View>
          ) : (
            <Ionicons name="logo-whatsapp" size={20} color={COLORS.success} />
          )}
        </PressableOpacity>
      ))}
    </View>
  );
}
