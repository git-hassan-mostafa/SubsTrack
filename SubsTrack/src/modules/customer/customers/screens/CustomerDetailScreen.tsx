import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Screen } from "@/src/shared/components/Screen";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { CustomerPaymentPanel } from "@/src/modules/customer/customer-payments";
import {
  CustomerSalesPanel,
  useSaleDetailSheet,
} from "@/src/modules/transaction/sales";
import { CustomerToCollectPanel } from "@/src/modules/transaction/to-collect";
import { CustomerDetailsCard } from "../components/CustomerDetailsCard";
import { CustomerHero } from "../components/CustomerHero";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { CustomerHistorySheet } from "../components/CustomerHistorySheet";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { useWhatsAppActions } from "@/src/modules/whatsapp/hooks/useWhatsAppActions";
import { headerReminderKey } from "@shared/modules/whatsapp/utils/whatsappMenu";

export function CustomerDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const getCustomer = useCustomerSlice((state) => state.getCustomer);
  const fetchCustomer = useCustomerSlice((state) => state.fetchCustomer);
  const error = useCustomerSlice((state) => state.error);
  const loading = useCustomerSlice((state) => state.loading);
  const clearError = useCustomerSlice((state) => state.clearError);
  const customer = useCustomerSlice(
    (state) => state.items.find((c) => c.id === id) ?? null,
  );

  const [editVisible, setEditVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const saleDetail = useSaleDetailSheet();
  const whatsappActions = useWhatsAppActions();
  const whatsappReminder = customer
    ? whatsappActions
        .rowItems(customer)
        .find((item) => item.key === headerReminderKey(customer) && !item.disabled)
    : undefined;

  useEffect(() => {
    if (id) void getCustomer(id);
  }, [id, getCustomer]);

  const handleRefresh = useCallback(() => {
    if (id) void fetchCustomer(id);
    setRefreshToken((n) => n + 1);
  }, [id, fetchCustomer]);

  return (
    <Screen>
      <PageHeader
        title={t("customers.details_section")}
        showBack
        onBack={() => router.back()}
        iconActions={[
          ...(whatsappReminder
            ? [
                {
                  key: whatsappReminder.key,
                  group: whatsappReminder.group,
                  icon: "logo-whatsapp" as const,
                  label: whatsappReminder.label,
                  onPress: whatsappReminder.onPress,
                },
              ]
            : []),
        ]}
        hideBranchSelector
        hideQuickActions
      />

      <ResponsiveContainer className="flex-1">
        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {loading && !customer ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : customer ? (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={handleRefresh}
                tintColor={COLORS.primary}
              />
            }
          >
            <CustomerHero
              customer={customer}
              onEdit={() => setEditVisible(true)}
              onHistory={() => setHistoryVisible(true)}
            />
            <CustomerPaymentPanel
              customer={customer}
              refreshToken={refreshToken}
            />
            <CustomerDetailsCard
              customer={customer}
              onDeleted={() => router.back()}
            />
            <CustomerSalesPanel customer={customer} />
            <CustomerToCollectPanel
              customer={customer}
              onOpenSale={saleDetail.openSale}
            />
            <View className="h-8" />
          </ScrollView>
        ) : null}
      </ResponsiveContainer>

      {editVisible && customer && (
        <CustomerFormSheet
          customer={customer}
          onDismiss={() => setEditVisible(false)}
        />
      )}

      {historyVisible && customer && (
        <CustomerHistorySheet
          customer={customer}
          onDismiss={() => setHistoryVisible(false)}
        />
      )}

      {saleDetail.sheet}
      {whatsappActions.sheet}
    </Screen>
  );
}
