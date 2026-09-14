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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-sm text-gray-600">{label}</Text>
      <Text fontWeight="SemiBold" className="text-sm text-gray-900">
        {value}
      </Text>
    </View>
  );
}

export function CustomerAllowanceSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const allowance = useBillingSlice((s) => s.allowance);
  const price = useBillingSlice((s) => s.pricePerCustomerUsd);
  const activeCustomers = useBillingSlice((s) => s.activeCustomers);
  const request = useBillingSlice((s) => s.request);
  const saving = useBillingSlice((s) => s.saving);
  const refreshRequest = useBillingSlice((s) => s.refreshRequest);
  const cancelRequest = useBillingSlice((s) => s.cancelRequest);
  const [sheet, setSheet] = useState<"new" | "edit" | null>(null);

  const tenantId = user?.tenantId;
  useFocusEffect(
    useCallback(() => {
      if (tenantId) void refreshRequest(tenantId);
    }, [tenantId, refreshRequest]),
  );

  const amount = billingService.monthlyAmountUsd(activeCustomers, price);
  const pending = request?.status === "pending" ? request : null;
  const declined = request?.status === "declined" ? request : null;

  async function handleCancel() {
    if (!pending) return;
    const ok = await confirm({
      title: t("billing.cancel_confirm_title"),
      message: t("billing.cancel_confirm_body", { count: pending.requestedCount }),
      confirmLabel: t("billing.cancel_request"),
      destructive: true,
    });
    if (ok) await cancelRequest();
  }

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-1"
      >
        {t("billing.section_title")}
      </Text>
      <Text className="text-xs text-gray-500 mb-3">
        {t("billing.section_hint")}
      </Text>

      <Row label={t("billing.allowed_customers")} value={String(allowance)} />
      <Row label={t("billing.current_customers")} value={String(activeCustomers)} />
      <Row label={t("billing.monthly_amount")} value={`$${amount.toFixed(2)}`} />
      <Text className="text-xs text-gray-400 mb-3">
        {t("billing.amount_note", {
          count: activeCustomers,
          price: price.toString(),
        })}
      </Text>

      {pending ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
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
            <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
              <Text fontWeight="SemiBold" className="text-sm text-red-800 mb-0.5">
                {t("billing.declined_title")}
              </Text>
              <Text className="text-xs text-red-700">
                {t("billing.declined_body", { count: declined.requestedCount })}
              </Text>
            </View>
          ) : null}
          <Button
            label={t("billing.request_more")}
            onPress={() => setSheet("new")}
            fullWidth
          />
        </>
      )}

      {sheet ? (
        <CustomerRequestSheet
          editing={sheet === "edit"}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}
