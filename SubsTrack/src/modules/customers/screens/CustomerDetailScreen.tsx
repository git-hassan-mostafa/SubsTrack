import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { getDateLocale } from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { CustomerPaymentPanel } from "@/src/modules/payments/components/CustomerPaymentPanel";
import { CustomerDetailsCard } from "../components/CustomerDetailsCard";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerStore } from "../store/customerStore";
import { AVATAR_COLORS } from "../../../shared/constants";

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function CustomerDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const customerStore = useCustomerStore();
  const customer = useCustomerStore(
    (state) => state.customers.find((c) => c.id === id) ?? null,
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

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="me-3 p-1">
          <DirectionalIcon
            name="chevron-back"
            size={22}
            color={COLORS.primary}
          />
        </Pressable>
        {customer ? (
          <View
            className="w-10 h-10 rounded-xl items-center justify-center me-3"
            style={{ backgroundColor: getAvatarColor(customer.name) + "22" }}
          >
            <Text
              fontWeight="Bold"
              className="text-sm"
              style={{ color: getAvatarColor(customer.name) }}
            >
              {getInitials(customer.name)}
            </Text>
          </View>
        ) : null}
        <View className="flex-1">
          <Text
            fontWeight="Bold"
            className="text-base text-gray-900"
            numberOfLines={1}
          >
            {customer?.name ?? ""}
          </Text>
          {customer ? (
            <Text className="text-xs text-gray-400">
              {t("customers.plan_since", {
                plan: customer.plan?.name ?? t("common.no_plan"),
                date: new Date(customer.startDate).toLocaleDateString(locale, {
                  month: "short",
                  year: "numeric",
                }),
              })}
            </Text>
          ) : null}
        </View>
        {isAdmin ? (
          <Pressable
            onPress={() => setEditVisible(true)}
            className="ms-2 bg-primary rounded-full px-4 py-2"
          >
            <Text className="text-white font-semibold text-sm">
              {t("common.edit")}
            </Text>
          </Pressable>
        ) : null}
      </View>

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
          <CustomerDetailsCard customer={customer} />
          <View className="h-8" />
        </ScrollView>
      ) : null}

      {customer ? (
        <CustomerFormSheet
          visible={editVisible}
          customer={customer}
          onDismiss={() => setEditVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
