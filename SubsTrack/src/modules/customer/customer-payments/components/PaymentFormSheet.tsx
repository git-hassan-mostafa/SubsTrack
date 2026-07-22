import { useState, useMemo } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import type { Customer, CustomerPlan, MonthEntry } from "@/src/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { useAuth } from "@/src/modules/authentication/auth";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import { getStore } from "@/src/state/globalStore";
import { UpgradePromptModal } from "@/src/modules/admin/subscription";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { MONTHS } from "@/src/core/constants";
import { PaymentAmountPaidSection } from "./PaymentAmountPaidSection";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";

interface Props {
  entry: MonthEntry;
  customer: Customer;
  // The service line being paid — supplies the plan/price/currency and the
  // payment's customer_plan_id. `lines` (all the customer's lines) lets the
  // slice rebuild every line's grid after the write.
  line: CustomerPlan;
  lines: CustomerPlan[];
  graceDays: number;
  monthGrid: MonthEntry[];
  onDismiss: () => void;
}

type FormState = {
  customAmount: number | null;
  isOverrideEnabled: boolean;
  amountMode: "plan" | "custom";
  paymentMode: "full" | "partial" | "debt";
  amountPaid: number | null;
  customCurrencyId: string | null;
  notes: string;
  conflictConfirmed: boolean;
};

const EMPTY_FORM: FormState = {
  customAmount: null,
  isOverrideEnabled: false,
  amountMode: "plan",
  paymentMode: "full",
  amountPaid: null,
  customCurrencyId: null,
  notes: "",
  conflictConfirmed: false,
};

export function PaymentFormSheet({
  entry,
  customer,
  line,
  lines,
  graceDays,
  monthGrid,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createPayment = usePaymentSlice((s) => s.createPayment);
  const createMultiMonthPayment = usePaymentSlice(
    (s) => s.createMultiMonthPayment,
  );
  const loadingCreate = usePaymentSlice((s) => s.loadingCreate);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);
  const tierLimitError = usePaymentSlice((s) => s.tierLimitError);
  const clearTierLimitError = usePaymentSlice((s) => s.clearTierLimitError);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const currencies = useCurrencySlice((s) => s.items);
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const plan = line.plan ?? null;
  const isMultiMonth = (plan?.durationMonths ?? 1) > 1;
  const isFixedPlan = !!plan && !plan.isCustomPrice;
  const isCustomOrNoPlan = !plan || plan.isCustomPrice;

  const planCurrency = findCurrency(currencies, plan?.currencyId ?? null);
  const customCurrency = findCurrency(currencies, form.customCurrencyId);

  const { year: cy, month: cm } = getCurrentYearMonth();
  const isFutureMonth =
    entry.year > cy || (entry.year === cy && entry.month > cm);
  const blockedForInactive =
    (!customer.active || !line.active) && isFutureMonth;

  const conflictingLabels = useMemo(() => {
    if (!isMultiMonth || !plan) return [];
    const conflicts: string[] = [];
    for (let d = 0; d < plan.durationMonths; d++) {
      const date = new Date(entry.year, entry.month - 1 + d, 1);
      const bm = toBillingMonth(date.getFullYear(), date.getMonth() + 1);
      const gridEntry = monthGrid.find(
        (m) => m.billingMonth === bm && date.getFullYear() === m.year,
      );
      if (gridEntry?.status === "paid") {
        conflicts.push(t(`months.${MONTHS[date.getMonth()]}`));
      }
    }
    return conflicts;
  }, [entry]);

  const coveredMonths = useMemo(() => {
    if (!isMultiMonth || !plan) return [];
    return Array.from({ length: plan.durationMonths }, (_, d) => {
      const date = new Date(entry.year, entry.month - 1 + d, 1);
      const bm = toBillingMonth(date.getFullYear(), date.getMonth() + 1);
      const gridEntry = monthGrid.find((m) => m.billingMonth === bm);
      return {
        label: t(`months.${MONTHS[date.getMonth()]}`),
        billingMonth: bm,
        isConflict: gridEntry?.status === "paid",
      };
    });
  }, [entry]);

  const hasConflicts = conflictingLabels.length > 0;
  const showConflictWarning = hasConflicts && !form.conflictConfirmed;

  // Resolved amount_due + currency_id come from the "amount" section above:
  // plan price (multi-month / fixed not overridden / override→plan), or the
  // custom CurrencyInput value otherwise. The bottom section then controls
  // amount_paid: full = amountDue, partial = whatever the user typed,
  // debt = 0 (nothing collected, the whole amount becomes a debt).
  const isOnCustomPath =
    !isMultiMonth &&
    (isCustomOrNoPlan ||
      (isFixedPlan && form.isOverrideEnabled && form.amountMode === "custom"));

  const resolvedDue: number | null = isOnCustomPath
    ? form.customAmount
    : plan!.price!;
  const resolvedCurrencyId: string | null = isOnCustomPath
    ? form.customCurrencyId
    : plan!.currencyId;

  const resolvedPaid: number | null =
    form.paymentMode === "full"
      ? resolvedDue
      : form.paymentMode === "debt"
        ? 0
        : form.amountPaid;

  const resolvedCurrency = isOnCustomPath ? customCurrency : planCurrency;
  const formatResolved = (amount: number) =>
    formatMoney(amount, resolvedCurrency, resolvedCurrency);

  const canSubmit =
    resolvedDue !== null &&
    resolvedDue > 0 &&
    resolvedPaid !== null &&
    resolvedPaid >= 0 &&
    resolvedPaid <= resolvedDue &&
    !loadingCreate &&
    !blockedForInactive &&
    !showConflictWarning;

  // Switching between plan/custom amount or toggling override invalidates any
  // previously-entered partial amount paid — reset back to "full" so the user
  // doesn't accidentally submit a stale paid value against a new due value.
  function setAmountMode(mode: "plan" | "custom") {
    setForm((prev) => ({
      ...prev,
      amountMode: mode,
      paymentMode: "full",
      amountPaid: null,
    }));
  }

  function enableOverride() {
    setForm((prev) => ({
      ...prev,
      isOverrideEnabled: true,
      amountMode: "plan",
      paymentMode: "full",
      amountPaid: null,
    }));
  }

  async function handleSubmit() {
    if (!user || !canSubmit || loadingCreate) return;
    if (resolvedDue === null || resolvedPaid === null) return;

    if (isMultiMonth && plan) {
      if (!currentTier) return;
      await createMultiMonthPayment(
        entry.billingMonth,
        customer,
        line.id,
        plan,
        planCurrency,
        resolvedPaid,
        user.id,
        form.notes.trim() || null,
        user.tenantId,
        true, // skipConflicts — conflicts already confirmed or absent
        lines,
        entry.year,
        graceDays,
        currentTier,
      );
    } else {
      await createPayment(
        {
          billingMonth: entry.billingMonth,
          amountDue: resolvedDue,
          amountPaid: resolvedPaid,
          durationMonths: 1,
          currencyId: resolvedCurrencyId,
          customerId: customer.id,
          customerPlanId: line.id,
          planId: line.planId,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: form.notes.trim() || null,
        },
        findCurrency(currencies, resolvedCurrencyId),
        lines,
        graceDays,
      );
    }
    if (!getStore().getState().payments.error) {
      onDismiss();
    }
  }

  function handleDismiss() {
    clearError();
    onDismiss();
  }

  const blockRangeLabel =
    isMultiMonth && plan
      ? getBlockRangeLabel(
          toBillingMonth(entry.year, entry.month),
          plan.durationMonths,
          t,
        )
      : t(`months.${entry.label}`) + " " + entry.year;

  return (
    <>
      <FormSheet onDismiss={handleDismiss} title={t("payments.record_payment")}>
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

            {/* Conflict warning for multi-month plans */}
            {showConflictWarning ? (
              <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                <Text className="text-sm font-semibold text-amber-800 mb-1">
                  {t("payments.block_conflict_title")}
                </Text>
                <Text className="text-sm text-amber-700">
                  {t("payments.block_conflict_message", {
                    months: conflictingLabels.join(", "),
                  })}
                </Text>
                <PressableOpacity
                  onPress={() =>
                    setForm((prev) => ({ ...prev, conflictConfirmed: true }))
                  }
                  className="mt-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 self-start"
                >
                  <Text className="text-sm font-semibold text-amber-800">
                    {t("payments.block_conflict_proceed")}
                  </Text>
                </PressableOpacity>
              </View>
            ) : null}

            {/* Customer mini-header */}
            <View className="flex-row items-center mb-5">
              <View className="w-10 h-10 rounded-xl bg-success-50 items-center justify-center me-3">
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={COLORS.primary}
                />
              </View>
              <View>
                <Text className="text-base font-semibold text-gray-900">
                  {customer.name}
                </Text>
                <Text className="text-xs text-gray-400">
                  {blockRangeLabel} · {plan?.name || t("common.no_plan")}
                </Text>
              </View>
            </View>

            {/* Amount section — establishes amount_due + currency. Full/Partial
              choice lives in the section below, just above the submit button. */}
            <View className="bg-gray-50 rounded-2xl px-6 py-5 items-center mb-5">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                {t("payments.amount_section")}
              </Text>

              {/* Multi-month: fixed bundle price + month chips */}
              {isMultiMonth ? (
                <>
                  <Text fontWeight="Bold" className="text-4xl text-gray-900">
                    {formatMoney(plan!.price!, planCurrency, planCurrency)}
                  </Text>
                  <Text className="text-sm text-gray-400 mt-1">
                    {t("payments.per_n_months", {
                      count: plan!.durationMonths,
                    })}
                  </Text>
                  <View className="flex-row flex-wrap justify-center gap-1.5 mt-3">
                    {coveredMonths.map(
                      ({ label, billingMonth, isConflict }) => (
                        <View
                          key={billingMonth}
                          className={`px-3 py-1 rounded-full border ${
                            isConflict
                              ? "bg-gray-50 border-gray-200"
                              : "bg-indigo-50 border-indigo-200"
                          }`}
                        >
                          <Text
                            fontWeight="SemiBold"
                            className={`text-xs ${isConflict ? "text-gray-400 line-through" : "text-primary"}`}
                          >
                            {label}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                </>
              ) : null}

              {/* Single-month fixed plan — show price, allow override */}
              {!isMultiMonth && isFixedPlan && !form.isOverrideEnabled ? (
                <>
                  <Text fontWeight="Bold" className="text-4xl text-gray-900">
                    {formatMoney(plan!.price!, planCurrency, planCurrency)}
                  </Text>
                  <PressableOpacity onPress={enableOverride} className="mt-3">
                    <Text className="text-primary text-sm font-semibold">
                      {t("payments.override_amount")}
                    </Text>
                  </PressableOpacity>
                </>
              ) : null}

              {/* Single-month fixed plan with override: pick plan price or custom */}
              {!isMultiMonth && isFixedPlan && form.isOverrideEnabled ? (
                <>
                  <View className="flex-row gap-6 mb-3">
                    {(["plan", "custom"] as const).map((mode) => (
                      <PressableOpacity
                        key={mode}
                        onPress={() => setAmountMode(mode)}
                        className="flex-row items-center gap-2"
                      >
                        <View
                          className={`w-4 h-4 rounded-full border-2 items-center justify-center ${form.amountMode === mode ? "border-primary" : "border-gray-400"}`}
                        >
                          {form.amountMode === mode ? (
                            <View className="w-2 h-2 rounded-full bg-primary" />
                          ) : null}
                        </View>
                        <Text className="text-sm text-gray-700">
                          {mode === "plan"
                            ? t("payments.plan_price", {
                                price: formatMoney(
                                  plan!.price!,
                                  planCurrency,
                                  planCurrency,
                                ),
                              })
                            : t("payments.custom_amount")}
                        </Text>
                      </PressableOpacity>
                    ))}
                  </View>
                  {form.amountMode === "custom" ? (
                    <View className="w-full">
                      <CurrencyInput
                        amount={form.customAmount}
                        currencyId={form.customCurrencyId}
                        onChange={({ amount, currencyId }) =>
                          setForm((prev) => {
                            const currencyChanged =
                              currencyId !== prev.customCurrencyId;
                            const amountCleared =
                              amount === null || amount <= 0;
                            return {
                              ...prev,
                              customAmount: amount,
                              customCurrencyId: currencyId,
                              // Without an Amount Due, Partial can't be evaluated —
                              // revert to Full and drop any stale amount paid.
                              paymentMode: amountCleared
                                ? "full"
                                : prev.paymentMode,
                              amountPaid:
                                amountCleared || currencyChanged
                                  ? null
                                  : prev.amountPaid,
                            };
                          })
                        }
                        currencies={currencies}
                        placeholder={t("payments.enter_amount")}
                        onFocus={clearError}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}

              {/* Custom-price plan or no plan — straight CurrencyInput */}
              {!isMultiMonth && isCustomOrNoPlan ? (
                <View className="w-full">
                  <CurrencyInput
                    amount={form.customAmount}
                    currencyId={form.customCurrencyId}
                    onChange={({ amount, currencyId }) =>
                      setForm((prev) => {
                        const currencyChanged =
                          currencyId !== prev.customCurrencyId;
                        const amountCleared = amount === null || amount <= 0;
                        return {
                          ...prev,
                          customAmount: amount,
                          customCurrencyId: currencyId,
                          paymentMode: amountCleared
                            ? "full"
                            : prev.paymentMode,
                          amountPaid:
                            amountCleared || currencyChanged
                              ? null
                              : prev.amountPaid,
                        };
                      })
                    }
                    currencies={currencies}
                    placeholder={t("payments.enter_amount")}
                    onFocus={clearError}
                  />
                </View>
              ) : null}
            </View>

            <Input
              label={t("payments.notes_optional")}
              value={form.notes}
              onChangeText={(v) => setForm((prev) => ({ ...prev, notes: v }))}
              placeholder={t("payments.notes_placeholder")}
              onFocus={clearError}
            />

            <View className="h-4" />

            {/* Full / Partial / Debt selector — last decision before submit. */}
            <PaymentAmountPaidSection
              paymentMode={form.paymentMode}
              onPaymentModeChange={(mode) =>
                setForm((prev) => ({
                  ...prev,
                  paymentMode: mode,
                  amountPaid: mode === "partial" ? prev.amountPaid : null,
                }))
              }
              amountPaid={form.amountPaid}
              onAmountPaidChange={(amount) =>
                setForm((prev) => ({ ...prev, amountPaid: amount }))
              }
              currencyId={resolvedCurrencyId}
              amountDue={resolvedDue}
              formatAmount={formatResolved}
              onFocusClearError={clearError}
              partialDisabled={resolvedDue == null || resolvedDue <= 0}
            />

            <Button
              label={
                resolvedDue !== null &&
                resolvedPaid !== null &&
                resolvedPaid < resolvedDue
                  ? t("payments.record_payment_action")
                  : t("payments.mark_as_paid")
              }
              onPress={handleSubmit}
              loading={loadingCreate}
              disabled={!canSubmit}
              fullWidth
            />
            <Text className="text-xs text-gray-400 text-center mt-2">
              {t("payments.receipt_id_hint")}
            </Text>
        <View className="h-4" />
      </FormSheet>
      <UpgradePromptModal
        payload={tierLimitError}
        onClose={() => {
          clearTierLimitError();
          onDismiss();
        }}
      />
    </>
  );
}
