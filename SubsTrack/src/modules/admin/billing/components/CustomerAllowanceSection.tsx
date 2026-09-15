import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { CARD_SURFACE } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useAuth } from "@/src/modules/authentication/auth";
import { useBillingSlice } from "@/src/state/hooks/useBillingSlice";
import { confirm } from "@/src/shared/lib/confirm";
import billingService from "../services/BillingService";
import { CustomerRequestSheet } from "./CustomerRequestSheet";
import { UpdateAllowanceSheet } from "./UpdateAllowanceSheet";
import { UsageBar } from "./UsageBar";

type Sheet = "edit" | "update";

export function CustomerAllowanceSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const allowance = useBillingSlice((s) => s.allowance);
  const price = useBillingSlice((s) => s.pricePerCustomerUsd);
  const activeCustomers = useBillingSlice((s) => s.activeCustomers);
  const request = useBillingSlice((s) => s.request);
  const saving = useBillingSlice((s) => s.saving);
  const refreshRequest = useBillingSlice((s) => s.refreshRequest);
  const refreshCounts = useBillingSlice((s) => s.refreshCounts);
  const cancelRequest = useBillingSlice((s) => s.cancelRequest);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const tenantId = user?.tenantId;
  useFocusEffect(
    useCallback(() => {
      if (tenantId) void refreshRequest(tenantId);
      void refreshCounts();
    }, [tenantId, refreshRequest, refreshCounts]),
  );

  const amount = billingService.monthlyAmountUsd(activeCustomers, price);
  const remaining = Math.max(0, allowance - activeCustomers);
  const pending = request?.status === "pending" ? request : null;
  const declined = request?.status === "declined" ? request : null;

  async function handleCancel() {
    if (!pending) return;
    await confirm({
      title: t("billing.cancel_confirm_title"),
      message: t("billing.cancel_confirm_body", { count: pending.requestedCount }),
      confirmLabel: t("billing.cancel_request"),
      destructive: true,
      onConfirm: async () => {
        await cancelRequest();
      },
    });
  }

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-3"
      >
        {t("billing.section_title")}
      </Text>

      <UsageBar used={activeCustomers} total={allowance} />

      <View className="flex-row items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <View>
          <Text className="text-xs text-gray-500">
            {t("billing.monthly_amount")}
          </Text>
          <Text className="text-[11px] text-gray-400 mt-0.5">
            {t("billing.amount_note", {
              count: activeCustomers,
              price: price.toString(),
            })}
          </Text>
        </View>
        <Text fontWeight="SemiBold" className="text-lg text-gray-900">
          {`$${amount.toFixed(2)}`}
        </Text>
      </View>

      {pending ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4">
          <Text fontWeight="SemiBold" className="text-sm text-amber-900 mb-0.5">
            {t("billing.pending_title")}
          </Text>
          <Text className="text-xs text-amber-800 mb-3">
            {t("billing.pending_body", { count: pending.requestedCount })}
          </Text>
          <View className="flex-row gap-3">
            <PressableOpacity
              onPress={() => setSheet("edit")}
              disabled={saving}
              className="flex-1 border border-amber-300 rounded-xl py-2.5 items-center"
            >
              <Text fontWeight="SemiBold" className="text-sm text-amber-900">
                {t("billing.edit_request")}
              </Text>
            </PressableOpacity>
            <PressableOpacity
              onPress={() => void handleCancel()}
              disabled={saving}
              className="flex-1 border border-red-200 rounded-xl py-2.5 items-center"
            >
              <Text fontWeight="SemiBold" className="text-sm text-red-500">
                {t("billing.cancel_request")}
              </Text>
            </PressableOpacity>
          </View>
        </View>
      ) : (
        <>
          {declined ? (
            <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4">
              <Text fontWeight="SemiBold" className="text-sm text-red-800 mb-0.5">
                {t("billing.declined_title")}
              </Text>
              <Text className="text-xs text-red-700">
                {t("billing.declined_body", { count: declined.requestedCount })}
              </Text>
            </View>
          ) : null}
          <View className="mt-4">
            <Button
              label={t("billing.update_number")}
              onPress={() => setSheet("update")}
              fullWidth
            />
          </View>
          <Text className="text-[11px] text-gray-400 text-center mt-2">
            {t("billing.update_number_hint", { count: remaining })}
          </Text>
        </>
      )}

      {sheet === "update" ? (
        <UpdateAllowanceSheet onDismiss={() => setSheet(null)} />
      ) : null}
      {sheet === "edit" ? (
        <CustomerRequestSheet editing onDismiss={() => setSheet(null)} />
      ) : null}
    </View>
  );
}
