import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { CARD_SURFACE } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { Button } from "@/src/shared/components/Button";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { confirm } from "@shared/shared/lib/confirm";
import { useBillingContact } from "@shared/modules/admin/billing/hooks/useBillingContact";
import { useTenantPricing } from "@shared/modules/admin/billing/hooks/useTenantPricing";
import { askText, requestedPair } from "@shared/modules/admin/billing/utils/requestAsk";
import {
  freeLineCount,
  limitsCardMode,
  monthlyBillView,
  requestsByStatus,
} from "@shared/modules/admin/billing/utils/usage";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import { UpdateAllowanceSheet } from "./UpdateAllowanceSheet";
import { UsageBar } from "./UsageBar";

type Sheet = "edit" | "update";

export function CustomerAllowanceSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const limits = useBillingSlice((s) => s.limits);
  const active = useBillingSlice((s) => s.active);
  const pricing = useTenantPricing();
  const { canContact, changePlan } = useBillingContact(openWhatsApp);
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

  const remaining = freeLineCount(limits, active);
  const mode = limitsCardMode(pricing.pricingModel);
  const bill = monthlyBillView(pricing);
  const { pending, declined } = requestsByStatus(request);
  const pendingAsk = pending ? askText(t, requestedPair(pending)) : "";
  const declinedAsk = declined ? askText(t, requestedPair(declined)) : "";

  async function handleCancel() {
    if (!pending) return;
    await confirm({
      title: t("billing.cancel_confirm_title"),
      message: t("billing.cancel_confirm_body", { ask: pendingAsk }),
      confirmLabel: t("billing.cancel_request"),
      destructive: true,
      onConfirm: async () => {
        await cancelRequest();
      },
    });
  }

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <SectionLabel className="mb-3">{t("billing.section_title")}</SectionLabel>

      {mode.showsLimits ? (
        <>
          <UsageBar
            kind="customers"
            used={active.customers}
            total={limits.customers}
          />
          <View className="mt-4 pt-4 border-t border-gray-100">
            <UsageBar kind="plans" used={active.plans} total={limits.plans} />
          </View>
        </>
      ) : (
        <View>
          <Text fontWeight="SemiBold" className="text-base text-gray-900">
            {t("billing.no_limit_title")}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {t("billing.active_now", {
              customers: active.customers,
              plans: active.plans,
            })}
          </Text>
        </View>
      )}

      <View className="flex-row items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <View className="flex-1 pe-3">
          <Text className="text-xs text-gray-500">
            {t("billing.monthly_amount")}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t(bill.noteKey, bill.noteParams)}
          </Text>
        </View>
        <Text fontWeight="SemiBold" className="text-lg text-gray-900">
          {bill.amountText}
        </Text>
      </View>

      {!mode.selfServe ? (
        <View className="mt-4">
          {canContact ? (
            <Button label={t("billing.change_plan")} onPress={changePlan} fullWidth />
          ) : null}
          <Text className="text-xs text-gray-400 text-center mt-2">
            {t("billing.change_plan_hint")}
          </Text>
        </View>
      ) : pending ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4">
          <Text fontWeight="SemiBold" className="text-sm text-amber-900 mb-0.5">
            {t("billing.pending_title")}
          </Text>
          <Text className="text-xs text-amber-800 mb-3">
            {t("billing.pending_body", { ask: pendingAsk })}
          </Text>
          <View className="flex-row gap-3">
            <PressableOpacity
              onPress={() => setSheet("edit")}
              disabled={saving}
              containerClassName="flex-1 border border-amber-300 rounded-xl" className="py-2.5 items-center"
            >
              <Text fontWeight="SemiBold" className="text-sm text-amber-900">
                {t("billing.edit_request")}
              </Text>
            </PressableOpacity>
            <PressableOpacity
              onPress={() => void handleCancel()}
              disabled={saving}
              containerClassName="flex-1 border border-red-200 rounded-xl" className="py-2.5 items-center"
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
              <Text
                fontWeight="SemiBold"
                className="text-sm text-red-800 mb-0.5"
              >
                {t("billing.declined_title")}
              </Text>
              <Text className="text-xs text-red-700">
                {t("billing.declined_body", { ask: declinedAsk })}
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
          <Text className="text-xs text-gray-400 text-center mt-2">
            {t("billing.update_number_hint", { count: remaining })}
          </Text>
        </>
      )}

      {sheet === "update" ? (
        <UpdateAllowanceSheet onDismiss={() => setSheet(null)} />
      ) : null}
      {sheet === "edit" ? (
        <UpdateAllowanceSheet editing onDismiss={() => setSheet(null)} />
      ) : null}
    </View>
  );
}
