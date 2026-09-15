import { useState } from "react";
import { View, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { AppTextInput } from "@/src/shared/components/AppTextInput";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { useHoldRepeat } from "@/src/shared/hooks/useHoldRepeat";
import { digitsOnly } from "@/src/core/utils/inputText";
import { COLORS } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import { useAuth } from "@/src/modules/authentication/auth";
import { useBillingSlice } from "@/src/state/hooks/useBillingSlice";
import { useSupportWhatsAppNumber } from "@/src/state/hooks/useOptionSlice";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import billingService from "../services/BillingService";
import { MIN_CUSTOMER_ALLOWANCE, MIN_CUSTOMER_REQUEST } from "../utils/types";
import { signedText } from "../utils/allowanceChange";

interface Props {
  editing?: boolean;
  onDismiss: () => void;
}

// A minus may be typed or pasted into the change field; the total never takes one.
const signedDigits = (next: string): string =>
  (next.startsWith("-") ? "-" : "") + digitsOnly(next);

// Both boxes are a fixed h-12 so they line up; Android drifts a fixed-height
// field's text to the top without this.
const CENTERED_FIELD_TEXT: TextStyle = { textAlignVertical: "center" };

export function UpdateAllowanceSheet({ editing = false, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const request = useBillingSlice((s) => s.request);
  const editRequest = useBillingSlice((s) => s.editRequest);
  const allowance = useBillingSlice((s) => s.allowance);
  const activeCustomers = useBillingSlice((s) => s.activeCustomers);
  const price = useBillingSlice((s) => s.pricePerCustomerUsd);
  const saving = useBillingSlice((s) => s.saving);
  const error = useBillingSlice((s) => s.error);
  const clearError = useBillingSlice((s) => s.clearError);
  const lowerAllowance = useBillingSlice((s) => s.lowerAllowance);
  const requestMore = useBillingSlice((s) => s.requestMore);
  const supportNumber = useSupportWhatsAppNumber();

  // Editing a pending request re-opens on the number already asked for; the
  // allowance itself has not moved, so that path can only ever be a raise.
  const pendingCount = request?.requestedCount ?? MIN_CUSTOMER_REQUEST;
  const [total, setTotal] = useState(
    editing ? allowance + pendingCount : allowance,
  );
  const dirty = useDirtyForm({ total });

  const floor = editing ? allowance : MIN_CUSTOMER_ALLOWANCE;
  const delta = total - allowance;
  const raising = delta > 0;
  const lowering = !editing && delta < 0;
  const atMinimum = total <= floor;
  const belowFloor = !editing && total < activeCustomers;
  const belowMinimum = !editing && total < MIN_CUSTOMER_ALLOWANCE;
  const tooSmallRaise = (editing || raising) && delta < MIN_CUSTOMER_REQUEST;
  const valid =
    (editing || delta !== 0) && !belowFloor && !belowMinimum && !tooSmallRaise;

  // Each field writes the OTHER one's source of truth, so they can never drift:
  // `total` is the only state, and the change field is a view over it.
  const totalField = useTextField(
    String(total),
    (next) => {
      setTotal(Number(next) || 0);
    },
    { sanitize: digitsOnly, expectedEcho: (next) => String(Number(next) || 0) },
  );

  const deltaField = useTextField(
    signedText(delta),
    (next) => {
      setTotal(Math.max(floor, allowance + (Number(next) || 0)));
    },
    {
      sanitize: signedDigits,
      expectedEcho: (next) =>
        signedText(
          Math.max(floor, allowance + (Number(next) || 0)) - allowance,
        ),
    },
  );

  const step = (by: number) => setTotal((n) => Math.max(floor, n + by));
  const holdDown = useHoldRepeat(() => step(-1));
  const holdUp = useHoldRepeat(() => step(1));

  function fieldError(): string | null {
    if (belowFloor)
      return t("billing.decrease_floor_error", {
        count: activeCustomers,
        requested: total,
        excess: activeCustomers - total,
      });
    if (belowMinimum)
      return t("billing.decrease_min_error", { min: MIN_CUSTOMER_ALLOWANCE });
    if (tooSmallRaise)
      return t("billing.request_min_error", { min: MIN_CUSTOMER_REQUEST });
    return null;
  }

  async function submitLower() {
    let lowered = false;
    await confirm({
      title: t("billing.decrease_confirm_title"),
      message: t("billing.decrease_confirm_body", { from: allowance, to: total }),
      confirmLabel: t("billing.decrease_save"),
      onConfirm: async () => {
        lowered = await lowerAllowance(total);
      },
    });
    if (lowered) onDismiss();
  }

  async function submitRaise(alsoWhatsApp: boolean) {
    if (!user) return;
    const ok = editing
      ? await editRequest(delta)
      : await requestMore(user.tenantId, delta, user.id);
    if (!ok) return;
    if (alsoWhatsApp && supportNumber) {
      void openWhatsApp(
        supportNumber,
        t("billing.whatsapp_request_message", {
          org: user.tenant.name,
          count: delta,
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
          {t("billing.allowed_customers")}
        </Text>
        <Text fontWeight="Bold" className="text-3xl text-gray-900 mt-1">
          {allowance}
        </Text>
        <Text className="text-xs text-gray-400 mt-0.5">
          {t("billing.active_now", { count: activeCustomers })}
        </Text>
      </View>

      <View className="flex-row items-start gap-3 mb-1">
        <View className="flex-1">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
          >
            {t("billing.new_total_label")}
          </Text>
          <AppTextInput
            {...totalField}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="0"
            placeholderTextColor={COLORS.gray400}
            onFocus={clearError}
            containerClassName="w-full"
            style={CENTERED_FIELD_TEXT}
            className={`h-12 border rounded-xl px-4 text-base text-gray-900 bg-white ${
              fieldError() ? "border-danger" : "border-gray-200"
            }`}
          />
        </View>

        <View className="flex-1">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
          >
            {t("billing.change_label")}
          </Text>
          <View className="h-12 flex-row items-center rounded-xl border border-gray-200 bg-white px-1">
            <PressableOpacity
              onPress={() => step(-1)}
              {...holdDown}
              disabled={atMinimum}
              className={`w-10 h-10 rounded-lg items-center justify-center ${
                atMinimum ? "bg-gray-50" : "bg-gray-100"
              }`}
            >
              <Ionicons
                name="remove"
                size={16}
                color={atMinimum ? COLORS.gray300 : COLORS.gray700}
              />
            </PressableOpacity>
            <AppTextInput
              {...deltaField}
              keyboardType="numbers-and-punctuation"
              maxLength={7}
              placeholder="0"
              placeholderTextColor={COLORS.gray400}
              onFocus={clearError}
              containerClassName="flex-1"
              style={CENTERED_FIELD_TEXT}
              className={`text-center text-base ${
                raising
                  ? "text-success"
                  : lowering
                    ? "text-danger"
                    : "text-gray-400"
              }`}
            />
            <PressableOpacity
              onPress={() => step(1)}
              {...holdUp}
              className="w-10 h-10 rounded-lg bg-gray-100 items-center justify-center"
            >
              <Ionicons name="add" size={16} color={COLORS.gray700} />
            </PressableOpacity>
          </View>
        </View>
      </View>

      {fieldError() ? (
        <Text className="mb-3 text-sm text-danger">{fieldError()}</Text>
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

      {belowFloor ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Text fontWeight="SemiBold" className="text-sm text-amber-900 mb-0.5">
            {t("billing.decrease_deactivate_title")}
          </Text>
          <Text className="text-xs text-amber-800">
            {t("billing.decrease_deactivate_body", {
              count: activeCustomers - total,
            })}
          </Text>
        </View>
      ) : null}

      {lowering && !belowFloor ? (
        <Text className="text-xs text-gray-500 mb-4">
          {t("billing.decrease_billing_note", {
            amount: billingService
              .monthlyAmountUsd(activeCustomers, price)
              .toFixed(2),
          })}
        </Text>
      ) : null}

      {raising && !tooSmallRaise ? (
        <Text className="text-xs text-gray-500 mb-4">
          {t("billing.raise_needs_approval", { count: delta })}
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
