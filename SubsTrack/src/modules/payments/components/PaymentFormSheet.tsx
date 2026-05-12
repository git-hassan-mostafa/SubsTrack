import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer, MonthEntry } from "@/src/core/types";
import { getCurrentYearMonth } from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePaymentStore } from "../store/paymentStore";
import { AVATAR_COLORS } from "../../../shared/constants";

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  visible: boolean;
  entry: MonthEntry | null;
  customer: Customer;
  graceDays: number;
  onDismiss: () => void;
}

type FormState = {
  customAmountText: string;
  isOverrideEnabled: boolean;
  amountMode: "plan" | "custom";
  notes: string;
};

const EMPTY_FORM: FormState = {
  customAmountText: "",
  isOverrideEnabled: false,
  amountMode: "plan",
  notes: "",
};

export function PaymentFormSheet({
  visible,
  entry,
  customer,
  graceDays,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createPayment, loadingCreate, error, clearError } = usePaymentStore();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  if (!entry) return null;

  const plan = customer.plan;
  const isFixedPlan = !!plan && !plan.isCustomPrice;
  const isCustomOrNoPlan = !plan || plan.isCustomPrice;

  const { year: cy, month: cm } = getCurrentYearMonth();
  const isFutureMonth =
    entry.year > cy || (entry.year === cy && entry.month > cm);
  const blockedForInactive = !customer.active && isFutureMonth;

  const resolvedAmount = (() => {
    if (isFixedPlan && !form.isOverrideEnabled) return plan!.price!;
    if (isFixedPlan && form.isOverrideEnabled && form.amountMode === "plan")
      return plan!.price!;
    const v = parseFloat(form.customAmountText);
    return isNaN(v) ? null : v;
  })();

  const canSubmit =
    resolvedAmount !== null &&
    resolvedAmount > 0 &&
    !loadingCreate &&
    !blockedForInactive;

  async function handleSubmit() {
    if (!user || !canSubmit || loadingCreate) return;
    await createPayment(
      {
        billingMonth: entry!.billingMonth,
        amount: resolvedAmount!,
        customerId: customer.id,
        planId: customer.planId,
        receivedByUserId: user.id,
        tenantId: user.tenantId,
        notes: form.notes.trim() || null,
      },
      customer,
      graceDays,
    );
    if (!usePaymentStore.getState().error) {
      setForm(EMPTY_FORM);
      onDismiss();
    }
  }

  function handleDismiss() {
    setForm(EMPTY_FORM);
    clearError();
    onDismiss();
  }

  const monthLabel = t(`months.${entry.label}`);
  const avatarColor = getAvatarColor(customer.name);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View className="flex-1 bg-white">
        {/* Handle + header */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {t("payments.record_payment")}
          </Text>
          <Pressable onPress={handleDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-6 pt-5"
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}
          {blockedForInactive ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-amber-700">
                {t("payments.inactive_customer_future")}
              </Text>
            </View>
          ) : null}

          {/* Customer mini-header */}
          <View className="flex-row items-center mb-5">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center me-3"
              style={{ backgroundColor: avatarColor + "22" }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: avatarColor }}
              >
                {getInitials(customer.name)}
              </Text>
            </View>
            <View>
              <Text className="text-base font-semibold text-gray-900">
                {customer.name}
              </Text>

              <Text className="text-xs text-gray-400">
                {monthLabel} {entry.year} ·{" "}
                {customer.plan?.name ?? t("common.no_plan")}
              </Text>
            </View>
          </View>

          {/* Amount display card */}
          <View className="bg-gray-50 rounded-2xl px-6 py-5 items-center mb-5">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {t("payments.amount_section")}
            </Text>
            {isFixedPlan && !form.isOverrideEnabled ? (
              <>
                <Text className="text-5xl font-bold text-gray-900">
                  ${plan!.price!.toFixed(0)}
                  <Text className="text-3xl text-gray-300">
                    .{(plan!.price! % 1).toFixed(2).slice(2)}
                  </Text>
                </Text>
                <Pressable
                  onPress={() =>
                    setForm((prev) => ({ ...prev, isOverrideEnabled: true }))
                  }
                  className="mt-3"
                >
                  <Text className="text-primary text-sm font-semibold">
                    {t("payments.override_amount")}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {isFixedPlan && form.isOverrideEnabled ? (
              <>
                <View className="w-full gap-2 mb-2">
                  {(["plan", "custom"] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() =>
                        setForm((prev) => ({ ...prev, amountMode: mode }))
                      }
                      className={`flex-row items-center border rounded-xl px-4 py-3 ${form.amountMode === mode ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"}`}
                    >
                      <View
                        className={`w-4 h-4 rounded-full border-2 me-3 items-center justify-center ${form.amountMode === mode ? "border-primary" : "border-gray-400"}`}
                      >
                        {form.amountMode === mode ? (
                          <View className="w-2 h-2 rounded-full bg-primary" />
                        ) : null}
                      </View>
                      <Text className="text-sm text-gray-700">
                        {mode === "plan"
                          ? t("payments.plan_price", {
                              price: `$${plan!.price}`,
                            })
                          : t("payments.custom_amount")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {form.amountMode === "custom" ? (
                  <Input
                    value={form.customAmountText}
                    onChangeText={(v) =>
                      setForm((prev) => ({ ...prev, customAmountText: v }))
                    }
                    placeholder={t("payments.enter_amount")}
                    keyboardType="decimal-pad"
                    onFocus={clearError}
                  />
                ) : null}
              </>
            ) : null}

            {isCustomOrNoPlan ? (
              <Input
                value={form.customAmountText}
                onChangeText={(v) =>
                  setForm((prev) => ({ ...prev, customAmountText: v }))
                }
                placeholder={t("payments.enter_amount")}
                keyboardType="decimal-pad"
                onFocus={clearError}
              />
            ) : null}
          </View>

          <Input
            label={t("payments.notes_optional")}
            value={form.notes}
            onChangeText={(v) => setForm((prev) => ({ ...prev, notes: v }))}
            placeholder={t("payments.notes_placeholder")}
            onFocus={clearError}
          />

          <Button
            label={t("payments.mark_as_paid")}
            onPress={handleSubmit}
            loading={loadingCreate}
            disabled={!canSubmit}
            fullWidth
          />
          <Text className="text-xs text-gray-400 text-center mt-2">
            {t("payments.receipt_id_hint")}
          </Text>
          <View className="h-4" />
        </ScrollView>
      </View>
    </Modal>
  );
}
