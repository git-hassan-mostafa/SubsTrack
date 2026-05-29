import { useState } from "react";
import { View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import type { Customer } from "@/src/core/types";
import { formatDate, getDateLocale } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useBranchStore } from "@/src/modules/branches/store/branchStore";
import { useCustomerStore } from "../store/customerStore";

interface CustomerDetailsCardProps {
  customer: Customer;
  onDeleted?: () => void;
}

export function CustomerDetailsCard({
  customer,
  onDeleted,
}: CustomerDetailsCardProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const customerStore = useCustomerStore();
  const { isAdmin } = useAuth();
  const branch = useBranchStore(
    (state) => state.branches.find((b) => b.id === customer.branchId) ?? null,
  );

  const [toggleConfirmVisible, setToggleConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  async function handleToggleActiveConfirmed() {
    if (customer.active) {
      await customerStore.deactivateCustomer(customer.id);
    } else {
      await customerStore.reactivateCustomer(customer.id);
    }
    setToggleConfirmVisible(false);
  }

  async function handleDeleteConfirmed() {
    const result = await customerStore.deleteCustomer(customer.id);
    setDeleteConfirmVisible(false);
    if (result === "hard") {
      onDeleted?.();
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

          {branch ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="git-branch-outline"
                  size={16}
                  color={COLORS.gray400}
                />
                <Text className="text-sm text-gray-500">
                  {t("branches.branch_label")}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-gray-900">
                {branch.name}
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

          {customer.area ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <View className="flex-row items-center gap-3">
                <Ionicons name="map-outline" size={16} color={COLORS.gray400} />
                <Text className="text-sm text-gray-500">
                  {t("customers.area_label")}
                </Text>
              </View>
              <Text
                className="text-sm font-semibold text-gray-900 flex-1 ms-4 text-right"
                numberOfLines={1}
              >
                {customer.area}
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

          {customer.notes ? (
            <View className="px-4 py-3.5 border-b border-gray-100">
              <View className="flex-row items-center gap-3 mb-1.5">
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={COLORS.gray400}
                />
                <Text className="text-sm text-gray-500">
                  {t("customers.notes_label")}
                </Text>
              </View>
              <Text className="text-sm font-medium text-gray-900 leading-5">
                {customer.notes}
              </Text>
            </View>
          ) : null}

          <PressableOpacity
            onPress={() => isAdmin && setToggleConfirmVisible(true)}
            className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100"
          >
            <View className="flex-row items-center gap-3">
              <View
                className="w-4 h-4 rounded-full items-center justify-center"
                style={{
                  backgroundColor: customer.active ? "#dcfce7" : "#fff7ed",
                }}
              >
                <View
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: customer.active
                      ? COLORS.success
                      : COLORS.warning,
                  }}
                />
              </View>
              <Text className="text-sm text-gray-500">
                {t("customers.status_label")}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Text
                className="text-sm font-semibold"
                style={{
                  color: customer.active ? COLORS.success : COLORS.warning,
                }}
              >
                {customer.active ? t("common.active") : t("common.inactive")}
              </Text>
              {isAdmin && (
                <DirectionalIcon
                  name="chevron-forward"
                  size={14}
                  color={COLORS.gray400}
                />
              )}
            </View>
          </PressableOpacity>

          {isAdmin && (
            <PressableOpacity
              onPress={() => setDeleteConfirmVisible(true)}
              className="flex-row items-center justify-between px-4 py-3.5"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={COLORS.danger}
                />
                <Text className="text-sm" style={{ color: COLORS.danger }}>
                  {t("customers.delete_label")}
                </Text>
              </View>
              <DirectionalIcon
                name="chevron-forward"
                size={14}
                color={COLORS.danger}
              />
            </PressableOpacity>
          )}
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

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title={t("customers.delete_title")}
        message={t("customers.delete_message", { name: customer.name })}
        destructive
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </>
  );
}
