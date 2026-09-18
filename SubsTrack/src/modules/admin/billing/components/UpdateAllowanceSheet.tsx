import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { confirm } from "@/src/shared/lib/confirm";
import { useAuth } from "@/src/modules/authentication/auth";
import { useBillingSlice } from "@/src/state/hooks/useBillingSlice";
import { useSupportWhatsAppNumber } from "@/src/state/hooks/useOptionSlice";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import billingService from "../services/BillingService";
import {
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
  QUOTA_KINDS,
  type QuotaKind,
  type QuotaPair,
} from "../utils/types";
import { askText, requestedPair } from "../utils/requestAsk";
import { AllowanceField } from "./AllowanceField";

interface Props {
  editing?: boolean;
  onDismiss: () => void;
}

const NO_CHANGE: QuotaPair = { customers: 0, plans: 0 };

export function UpdateAllowanceSheet({ editing = false, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const request = useBillingSlice((s) => s.request);
  const editRequest = useBillingSlice((s) => s.editRequest);
  const limits = useBillingSlice((s) => s.limits);
  const active = useBillingSlice((s) => s.active);
  const price = useBillingSlice((s) => s.pricePerPlanUsd);
  const saving = useBillingSlice((s) => s.saving);
  const error = useBillingSlice((s) => s.error);
  const clearError = useBillingSlice((s) => s.clearError);
  const lowerAllowances = useBillingSlice((s) => s.lowerAllowances);
  const requestMore = useBillingSlice((s) => s.requestMore);
  const supportNumber = useSupportWhatsAppNumber();

  // Editing a pending request re-opens on the numbers already asked for; the
  // limits themselves have not moved, so that path can only ever be a raise.
  const pendingAsk = request && editing ? requestedPair(request) : NO_CHANGE;
  const [total, setTotal] = useState<QuotaPair>({
    customers: limits.customers + pendingAsk.customers,
    plans: limits.plans + pendingAsk.plans,
  });
  const dirty = useDirtyForm({ ...total });

  const deltas: QuotaPair = {
    customers: total.customers - limits.customers,
    plans: total.plans - limits.plans,
  };
  const raising = QUOTA_KINDS.some((kind) => deltas[kind] > 0);
  const lowering = !editing && QUOTA_KINDS.some((kind) => deltas[kind] < 0);
  const mixed = raising && lowering;
  const totalDelta = deltas.customers + deltas.plans;
  const tooSmallRaise = (editing || raising) && totalDelta < MIN_CUSTOMER_REQUEST;
  const belowMinimum = !editing && total.customers < MIN_CUSTOMER_ALLOWANCE;
  const overCap = QUOTA_KINDS.filter((kind) => !editing && total[kind] < active[kind]);
  const valid =
    (editing || raising || lowering) &&
    !mixed &&
    !belowMinimum &&
    !tooSmallRaise &&
    overCap.length === 0;

  // Service lines can never be fewer than customers, so raising the customer
  // box carries the line box up with it rather than showing an error.
  function setCustomers(next: number) {
    setTotal((prev) => ({ customers: next, plans: Math.max(prev.plans, next) }));
  }

  function fieldError(kind: QuotaKind): string | null {
    if (!editing && total[kind] < active[kind])
      return t(`billing.decrease_floor_error_${kind}`, {
        count: active[kind],
        requested: total[kind],
        excess: active[kind] - total[kind],
      });
    if (kind === 'customers' && belowMinimum)
      return t("billing.decrease_min_error", { min: MIN_CUSTOMER_ALLOWANCE });
    return null;
  }

  function formError(): string | null {
    if (mixed) return t("billing.mixed_change_error");
    if (tooSmallRaise)
      return t("billing.request_min_error", { min: MIN_CUSTOMER_REQUEST });
    return null;
  }

  async function submitLower() {
    let lowered = false;
    await confirm({
      title: t("billing.decrease_confirm_title"),
      message: t("billing.decrease_confirm_body", {
        customers: total.customers,
        plans: total.plans,
      }),
      confirmLabel: t("billing.decrease_save"),
      onConfirm: async () => {
        lowered = await lowerAllowances(total);
      },
    });
    if (lowered) onDismiss();
  }

  async function submitRaise(alsoWhatsApp: boolean) {
    if (!user) return;
    const extra: QuotaPair = {
      customers: Math.max(0, deltas.customers),
      plans: Math.max(0, deltas.plans),
    };
    const ok = editing
      ? await editRequest(extra)
      : await requestMore(user.tenantId, extra, user.id);
    if (!ok) return;
    if (alsoWhatsApp && supportNumber) {
      void openWhatsApp(
        supportNumber,
        t("billing.whatsapp_request_message", {
          org: user.tenant.name,
          ask: askText(t, extra),
        }),
      );
    }
    onDismiss();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
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
        floor={editing ? limits.customers : MIN_CUSTOMER_ALLOWANCE}
        error={fieldError('customers')}
        onChange={setCustomers}
        onFocus={clearError}
      />

      <AllowanceField
        label={t("billing.allowed_plans")}
        current={limits.plans}
        value={total.plans}
        floor={editing ? limits.plans : total.customers}
        error={fieldError('plans')}
        onChange={(next) => setTotal((prev) => ({ ...prev, plans: next }))}
        onFocus={clearError}
      />

      {formError() ? (
        <Text className="mb-3 text-sm text-danger">{formError()}</Text>
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

      {overCap.length > 0 ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Text fontWeight="SemiBold" className="text-sm text-amber-900 mb-0.5">
            {t("billing.decrease_deactivate_title")}
          </Text>
          <Text className="text-xs text-amber-800">
            {t(`billing.decrease_deactivate_body_${overCap[0]}`, {
              count: active[overCap[0]] - total[overCap[0]],
            })}
          </Text>
        </View>
      ) : null}

      {lowering && overCap.length === 0 ? (
        <Text className="text-xs text-gray-500 mb-4">
          {t("billing.decrease_billing_note", {
            amount: billingService.monthlyAmountUsd(total.plans, price).toFixed(2),
          })}
        </Text>
      ) : null}

      {raising && !tooSmallRaise && !mixed ? (
        <Text className="text-xs text-gray-500 mb-4">
          {t("billing.raise_needs_approval", {
            ask: askText(t, {
              customers: Math.max(0, deltas.customers),
              plans: Math.max(0, deltas.plans),
            }),
          })}
        </Text>
      ) : null}

      <Button
        label={
          editing
            ? t("billing.save_request")
            : raising
              ? t("billing.send_request")
              : t("billing.decrease_save")
        }
        onPress={() =>
          void (editing || raising ? submitRaise(false) : submitLower())
        }
        loading={saving}
        disabled={!valid || saving}
        fullWidth
      />

      {(editing || raising) && supportNumber ? (
        <PressableOpacity
          onPress={() => void submitRaise(true)}
          disabled={!valid || saving}
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
