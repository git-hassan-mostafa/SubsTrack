import { useState } from "react";
import { View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { copyText } from "@/src/shared/lib/clipboard";
import { openLocation } from "@/src/shared/lib/maps";
import type { Customer } from "@shared/core/types";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { buildPortalLink } from "@shared/core/utils/portalLink";
import { isolate } from "@shared/core/utils/bidi";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { useCustomerStatusActions } from "@shared/modules/customer/customers/hooks/useCustomerStatusActions";
import { useCustomerPortalUrl } from "@shared/state/hooks/useOptionSlice";

interface CustomerDetailsCardProps {
  customer: Customer;
  onDeleted?: () => void;
}

export function CustomerDetailsCard({
  customer,
  onDeleted,
}: CustomerDetailsCardProps) {
  const { t } = useTranslation();
  const customerStatus = useCustomerStatusActions();
  const { isAdmin } = useAuth();
  const branch = useBranchSlice(
    (state) => state.items.find((b) => b.id === customer.branchId) ?? null,
  );
  const portalBaseUrl = useCustomerPortalUrl();
  const [copied, setCopied] = useState(false);

  const portalLink = customer.portalEnabled
    ? buildPortalLink(portalBaseUrl, customer.id)
    : null;

  async function handleCopyPortalLink() {
    if (!portalLink) return;
    if (await copyText(portalLink)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleToggleActive() {
    await customerStatus.toggleActive(customer);
  }

  async function handleDelete() {
    const { hardDeleted } = await customerStatus.remove([customer]);
    if (hardDeleted) onDeleted?.();
  }

  return (
    <View className="mx-4 mt-4">
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-2 px-1"
      >
        {t("customers.details_section")}
      </Text>
      <View className={`${CARD_SURFACE} overflow-hidden`}>
        {customer.phoneNumber ? (
          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <View className="flex-row items-center gap-3">
              <Ionicons name="call-outline" size={16} color={COLORS.gray400} />
              <Text className="text-sm text-gray-500">
                {t("customers.phone_label")}
              </Text>
            </View>
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
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
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
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
              fontWeight="SemiBold"
              className="text-sm text-gray-900 flex-1 ms-4 text-right"
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
              fontWeight="SemiBold"
              className="text-sm text-gray-900 flex-1 ms-4 text-right"
              numberOfLines={1}
            >
              {customer.area}
            </Text>
          </View>
        ) : null}

        {customer.locationUrl ? (
          <PressableOpacity
            onPress={() => void openLocation(customer.locationUrl)}
            className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100"
          >
            <View className="flex-row items-center gap-3">
              <Ionicons
                name="navigate-outline"
                size={16}
                color={COLORS.primary}
              />
              <Text fontWeight="SemiBold" className="text-sm text-primary">
                {t("customers.location_open")}
              </Text>
            </View>
            <DirectionalIcon
              name="chevron-forward"
              size={14}
              color={COLORS.primary}
            />
          </PressableOpacity>
        ) : null}


        {portalLink ? (
          <PressableOpacity
            onPress={() => void handleCopyPortalLink()}
            className="px-4 py-3.5 border-b border-gray-100"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name="globe-outline"
                  size={16}
                  color={COLORS.gray400}
                />
                <Text className="text-sm text-gray-500">
                  {t("customers.portal_link_label")}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={16}
                  color={copied ? COLORS.success : COLORS.primary}
                />
                <Text
                  fontWeight="SemiBold"
                  className="text-sm"
                  style={{ color: copied ? COLORS.success : COLORS.primary }}
                >
                  {copied
                    ? t("customers.portal_copied")
                    : t("common.copy")}
                </Text>
              </View>
            </View>
            <Text className="text-xs text-gray-500 mt-1.5" numberOfLines={2}>
              {isolate(portalLink)}
            </Text>
          </PressableOpacity>
        ) : null}

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
            <Text
              fontWeight="Medium"
              className="text-sm text-gray-900 leading-5"
            >
              {customer.notes}
            </Text>
          </View>
        ) : null}

        <PressableOpacity
          onPress={() => isAdmin && void handleToggleActive()}
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
              fontWeight="SemiBold"
              className="text-sm"
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
            onPress={() => void handleDelete()}
            className="flex-row items-center justify-between px-4 py-3.5"
          >
            <View className="flex-row items-center gap-3">
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
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
  );
}
