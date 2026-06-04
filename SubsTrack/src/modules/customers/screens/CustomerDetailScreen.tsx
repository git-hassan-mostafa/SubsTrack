import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { getDateLocale } from "@/src/core/utils/date";
import { CustomerPaymentPanel } from "@/src/modules/customer-payments/components/CustomerPaymentPanel";
import { CustomerDetailsCard } from "../components/CustomerDetailsCard";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";

export function CustomerDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const customerStore = useCustomerSlice();
  const customer = useCustomerSlice(
    (state) => state.items.find((c) => c.id === id) ?? null,
  );

  const [editVisible, setEditVisible] = useState(false);

  useEffect(() => {
    getSelectedCustomer();
  }, [id]);

  async function getSelectedCustomer() {
    if (id) await customerStore.getCustomer(id);
  }

  async function fetchSelectedCustomer() {
    if (id) await customerStore.fetchCustomer(id);
  }

  const handleRefresh = useCallback(() => {
    fetchSelectedCustomer();
  }, [id]);

  const subtitle = customer
    ? t("customers.plan_since", {
        plan: customer.plan?.name ?? t("common.no_plan"),
        date: new Date(customer.startDate).toLocaleDateString(locale, {
          month: "short",
          year: "numeric",
        }),
      })
    : undefined;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={customer?.name ?? ""}
        subtitle={subtitle}
        showBack
        onBack={() => router.back()}
        actionLabel={t("common.edit")}
        onAction={() => setEditVisible(true)}
        hideBranchSelector
      />

      {customerStore.error ? (
        <View className="px-4 pt-4">
          <ErrorBanner
            message={customerStore.error}
            onDismiss={customerStore.clearError}
          />
        </View>
      ) : null}

      {customerStore.loading && !customer ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : customer ? (
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={customerStore.loading}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          <CustomerPaymentPanel customer={customer} />
          <CustomerDetailsCard
            customer={customer}
            onDeleted={() => router.back()}
          />
          <View className="h-8" />
        </ScrollView>
      ) : null}

      {editVisible && customer && (
        <CustomerFormSheet
          customer={customer}
          onDismiss={() => setEditVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}
