import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { useSupportWhatsAppNumber } from "@shared/state/hooks/useOptionSlice";
import { useAllowanceForm } from "@shared/modules/admin/billing/hooks/useAllowanceForm";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import {
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
} from "@shared/modules/admin/billing/utils/types";
import { AllowanceField } from "./AllowanceField";

interface Props {
  editing?: boolean;
  onDismiss: () => void;
}

export function UpdateAllowanceSheet({ editing = false, onDismiss }: Props) {
  const { t } = useTranslation();
  const saving = useBillingSlice((s) => s.saving);
  const error = useBillingSlice((s) => s.error);
  const clearError = useBillingSlice((s) => s.clearError);
  const supportNumber = useSupportWhatsAppNumber();
  const form = useAllowanceForm(editing);
  const { total, limits, active, draft } = form;
  const overKind = draft.overCap[0];

  async function submitLower() {
    if (await form.lower()) onDismiss();
  }

  async function submitRaise(alsoWhatsApp: boolean) {
    const extra = await form.send();
    if (!extra) return;
    if (alsoWhatsApp && supportNumber) {
      void openWhatsApp(supportNumber, form.requestMessage(extra));
    }
    onDismiss();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={form.dirty}
      title={editing ? t("billing.edit_request") : t("billing.update_number")}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <View className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 mb-5">
        <Text className="text-xs text-gray-400">
          {t("billing.current_limits")}
        </Text>
        <Text fontWeight="Bold" className="text-xl text-gray-900 mt-1">
          {t("billing.current_limits_value", {
            customers: limits.customers,
            plans: limits.plans,
          })}
        </Text>
        <Text className="text-xs text-gray-400 mt-0.5">
          {t("billing.active_now", {
            customers: active.customers,
            plans: active.plans,
          })}
        </Text>
      </View>

      <AllowanceField
        label={t("billing.allowed_customers")}
        current={limits.customers}
        value={total.customers}
        floor={form.floor("customers")}
        error={form.fieldError("customers")}
        onChange={form.setCustomers}
        onFocus={clearError}
      />

      <AllowanceField
        label={t("billing.allowed_plans")}
        current={limits.plans}
        value={total.plans}
        floor={form.floor("plans")}
        error={form.fieldError("plans")}
        onChange={form.setPlans}
        onFocus={clearError}
      />

      {form.formError ? (
        <Text className="mb-3 text-sm text-danger">{form.formError}</Text>
      ) : (
        <Text className="text-xs text-gray-400 mb-3">
          {editing
            ? t("billing.request_hint", { min: MIN_CUSTOMER_REQUEST })
            : t("billing.update_number_explainer", {
                min: MIN_CUSTOMER_REQUEST,
                floor: MIN_CUSTOMER_ALLOWANCE,
              })}
        </Text>
      )}

      {overKind ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Text fontWeight="SemiBold" className="text-sm text-amber-900 mb-0.5">
            {t("billing.decrease_deactivate_title")}
          </Text>
          <Text className="text-xs text-amber-800">
            {t(`billing.decrease_deactivate_body_${overKind}`, {
              count: active[overKind] - total[overKind],
            })}
          </Text>
        </View>
      ) : null}

      {draft.lowering && !overKind ? (
        <Text className="text-xs text-gray-500 mb-4">
          {t("billing.decrease_billing_note", {
            amount: form.loweredAmountUsd.toFixed(2),
          })}
        </Text>
      ) : null}

      {draft.raising && !draft.tooSmallRaise && !draft.mixed ? (
        <Text className="text-xs text-gray-500 mb-4">
          {t("billing.raise_needs_approval", { ask: form.askText })}
        </Text>
      ) : null}

      <Button
        label={
          editing
            ? t("billing.save_request")
            : draft.raising
              ? t("billing.send_request")
              : t("billing.decrease_save")
        }
        onPress={() =>
          void (form.sendsRequest ? submitRaise(false) : submitLower())
        }
        loading={saving}
        disabled={!draft.valid || saving}
        fullWidth
      />

      {form.sendsRequest && supportNumber ? (
        <PressableOpacity
          onPress={() => void submitRaise(true)}
          disabled={!draft.valid || saving}
          className="border border-green-200 rounded-xl py-3.5 items-center mt-3"
        >
          <Text fontWeight="SemiBold" className="text-green-700">
            {t("billing.send_request_whatsapp")}
          </Text>
        </PressableOpacity>
      ) : null}

      <View className="h-6" />
    </FormSheet>
  );
}
