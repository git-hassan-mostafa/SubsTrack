import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import type { Customer } from "@/src/core/types";
import { formatDate, getDateLocale } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useCustomerStore } from "../store/customerStore";

interface CustomerDetailsCardProps {
  customer: Customer;
}

export function CustomerDetailsCard({ customer }: CustomerDetailsCardProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const customerStore = useCustomerStore();
  const { isAdmin } = useAuth();

  const [toggleConfirmVisible, setToggleConfirmVisible] = useState(false);

  async function handleToggleActiveConfirmed() {
    setToggleConfirmVisible(false);
    if (customer.active) {
      await customerStore.deactivateCustomer(customer.id);
    } else {
      await customerStore.reactivateCustomer(customer.id);
    }
  }

  return (
    <>
      <View className="mx-4 mt-4">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
          {t("customers.details_section")}
        </Text>
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {customer.phoneNumber ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="call-outline"
                  size={16}
                  color={COLORS.gray400}
                />
                <Text className="text-sm text-gray-500">
                  {t("customers.phone_label")}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-gray-900">
                {customer.phoneNumber}
              </Text>
            </View>
          ) : null}

          {customer.address ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={COLORS.gray400}
                />
                <Text className="text-sm text-gray-500">
                  {t("customers.address_label")}
                </Text>
              </View>
              <Text
                className="text-sm font-semibold text-gray-900 flex-1 ms-4 text-right"
                numberOfLines={2}
              >
                {customer.address}
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <View className="flex-row items-center gap-3">
              <Ionicons
                name="calendar-outline"
                size={16}
                color={COLORS.gray400}
              />
              <Text className="text-sm text-gray-500">
                {t("customers.started_label")}
              </Text>
            </View>
            <Text className="text-sm font-semibold text-gray-900">
              {formatDate(customer.startDate, locale)}
            </Text>
          </View>

          <Pressable
            onPress={() => isAdmin && setToggleConfirmVisible(true)}
            className="flex-row items-center justify-between px-4 py-3.5"
          >
            <View className="flex-row items-center gap-3">
              <View
                className={`w-4 h-4 rounded-full items-center justify-center ${customer.active ? "bg-green-100" : "bg-gray-100"}`}
              >
                <View
                  className={`w-2 h-2 rounded-full ${customer.active ? "bg-success" : "bg-gray-400"}`}
                />
              </View>
              <Text className="text-sm text-gray-500">
                {t("customers.status_label")}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Text
                className={`text-sm font-semibold ${customer.active ? "text-success" : "text-gray-400"}`}
              >
                {customer.active ? t("common.active") : t("common.inactive")}
              </Text>
              {isAdmin && (
                <Text className="text-xs text-primary">
                  ({t("common.tap")})
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>

      <ConfirmDialog
        visible={toggleConfirmVisible}
        title={
          customer.active
            ? t("customers.deactivate_title")
            : t("customers.reactivate_title")
        }
        message={
          customer.active
            ? t("customers.deactivate_message", { name: customer.name })
            : t("customers.reactivate_message", { name: customer.name })
        }
        destructive={customer.active}
        onConfirm={handleToggleActiveConfirmed}
        onCancel={() => setToggleConfirmVisible(false)}
      />
    </>
  );
}
