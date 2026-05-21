import { useState, useMemo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import type { Customer, MonthEntry } from "@/src/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePaymentStore } from "../store/paymentStore";
import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { AVATAR_COLORS } from "../../../shared/constants";
import { MONTHS } from "@/src/core/constants";

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  entry: MonthEntry;
  customer: Customer;
  graceDays: number;
  monthGrid: MonthEntry[];
  onDismiss: () => void;
}

type FormState = {
  customAmount: number | null;
  isOverrideEnabled: boolean;
  amountMode: "plan" | "custom";
  paymentMode: "full" | "partial";
  amountDue: number | null;
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
  amountDue: null,
  amountPaid: null,
  customCurrencyId: null,
  notes: "",
  conflictConfirmed: false,
};

export function PaymentFormSheet({
  entry,
  customer,
  graceDays,
  monthGrid,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    createPayment,
    createMultiMonthPayment,
    loadingCreate,
    error,
    clearError,
  } = usePaymentStore();
  const { currencies } = useCurrencyStore();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Resolve the active source currency (the one amounts are denominated in
  // for the current input mode). null = USD.
  const planCurrency = findCurrency(currencies, customer.plan?.currencyId ?? null);
  const customCurrency = findCurrency(currencies, form.customCurrencyId);
  const formatAmount = (amount: number, isCustom: boolean) =>
    formatMoney(amount, isCustom ? customCurrency : planCurrency, isCustom ? customCurrency : planCurrency, locale);

  const plan = customer.plan;
  const isMultiMonth = (plan?.durationMonths ?? 1) > 1;
  const isFixedPlan = !!plan && !plan.isCustomPrice;
  const isCustomOrNoPlan = !plan || plan.isCustomPrice;

  const { year: cy, month: cm } = getCurrentYearMonth();
  const isFutureMonth =
    entry.year > cy || (entry.year === cy && entry.month > cm);
  const blockedForInactive = !customer.active && isFutureMonth;

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

  // Resolves the final amount_due, amount_paid, and currency_id about to be
  // saved. When the user is using the plan price, the currency comes from the
  // plan; when entering a custom amount the user picks via CurrencyInput.
  const resolvedAmounts = useMemo((): {
    amountDue: number | null;
    amountPaid: number | null;
    currencyId: string | null;
  } => {
    if (isMultiMonth) {
      const due = plan!.price!;
      if (form.paymentMode === "full") {
        return { amountDue: due, amountPaid: due, currencyId: plan!.currencyId };
      }
      return { amountDue: due, amountPaid: form.amountPaid, currencyId: plan!.currencyId };
    }
    if (isFixedPlan && !form.isOverrideEnabled) {
      return { amountDue: plan!.price!, amountPaid: plan!.price!, currencyId: plan!.currencyId };
    }
    if (isFixedPlan && form.isOverrideEnabled && form.amountMode === "plan") {
      return { amountDue: plan!.price!, amountPaid: plan!.price!, currencyId: plan!.currencyId };
    }
    // Custom amount path — currency comes from the CurrencyInput state.
    if (form.paymentMode === "full") {
      return {
        amountDue: form.customAmount,
        amountPaid: form.customAmount,
        currencyId: form.customCurrencyId,
      };
    }
    return {
      amountDue: form.amountDue,
      amountPaid: form.amountPaid,
      currencyId: form.customCurrencyId,
    };
  }, [isMultiMonth, isFixedPlan, plan, form]);

  const { amountDue: resolvedDue, amountPaid: resolvedPaid, currencyId: resolvedCurrencyId } = resolvedAmounts;
  const canSubmit =
    resolvedDue !== null && resolvedDue > 0 &&
    resolvedPaid !== null && resolvedPaid >= 0 &&
    resolvedPaid <= resolvedDue &&
    !loadingCreate && !blockedForInactive && !showConflictWarning;

  async function handleSubmit() {
    if (!user || !canSubmit || loadingCreate) return;
    if (resolvedDue === null || resolvedPaid === null) return;

    if (isMultiMonth && plan) {
      await createMultiMonthPayment(
        entry.billingMonth,
        customer,
        plan,
        planCurrency,
        resolvedPaid,
        user.id,
        form.notes.trim() || null,
        user.tenantId,
        true, // skipConflicts — conflicts already confirmed or absent
        entry.year,
        graceDays,
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
          planId: customer.planId,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: form.notes.trim() || null,
        },
        findCurrency(currencies, resolvedCurrencyId),
        customer,
        graceDays,
      );
    }
    if (!usePaymentStore.getState().error) {
      onDismiss();
    }
  }

  function handleDismiss() {
    clearError();
    onDismiss();
  }

  const avatarColor = getAvatarColor(customer.name);

  const blockRangeLabel =
    isMultiMonth && plan
      ? getBlockRangeLabel(
          toBillingMonth(entry.year, entry.month),
          plan.durationMonths,
          t,
        )
      : t(`months.${entry.label}`) + " " + entry.year;

  return (
    <Modal
      visible
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
              <Pressable
                onPress={() =>
                  setForm((prev) => ({ ...prev, conflictConfirmed: true }))
                }
                className="mt-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 self-start"
              >
                <Text className="text-sm font-semibold text-amber-800">
                  {t("payments.block_conflict_proceed")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Customer mini-header */}
          <View className="flex-row items-center mb-5">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center me-3"
              style={{ backgroundColor: avatarColor + "22" }}
            >
              <Text
                fontWeight="Bold"
                className="text-sm"
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
                {blockRangeLabel} · {customer.plan?.name ?? t("common.no_plan")}
              </Text>
            </View>
          </View>

          {/* Amount display card */}
          <View className="bg-gray-50 rounded-2xl px-6 py-5 items-center mb-5">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {t("payments.amount_section")}
            </Text>

            {/* Multi-month: fixed bundle price + optional partial toggle */}
            {isMultiMonth ? (
              <>
                <Text fontWeight="Bold" className="text-4xl text-gray-900">
                  {formatAmount(plan!.price!, false)}
                </Text>
                <Text className="text-sm text-gray-400 mt-1">
                  {t("payments.per_n_months", { count: plan!.durationMonths })}
                </Text>
                <View className="flex-row flex-wrap justify-center gap-1.5 mt-3">
                  {coveredMonths.map(({ label, billingMonth, isConflict }) => (
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
                  ))}
                </View>
                {/* Full / partial toggle */}
                <View className="w-full gap-2 mt-4">
                  {(["full", "partial"] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setForm((prev) => ({ ...prev, paymentMode: mode, amountPaid: null }))}
                      className={`flex-row items-center border rounded-xl px-4 py-3 ${form.paymentMode === mode ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"}`}
                    >
                      <View className={`w-4 h-4 rounded-full border-2 me-3 items-center justify-center ${form.paymentMode === mode ? "border-primary" : "border-gray-400"}`}>
                        {form.paymentMode === mode ? <View className="w-2 h-2 rounded-full bg-primary" /> : null}
                      </View>
                      <Text className="text-sm text-gray-700">
                        {mode === "full" ? t("payments.full_payment") : t("payments.partial_payment")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {form.paymentMode === "partial" ? (
                  <View className="w-full mt-3">
                    {/* Lock the currency to the plan's currency — partial pays of a
                        bundle must be denominated in the same unit. */}
                    <CurrencyInput
                      label={t("payments.amount_paid_label")}
                      amount={form.amountPaid}
                      currencyId={plan!.currencyId}
                      onChange={({ amount }) => setForm((prev) => ({ ...prev, amountPaid: amount }))}
                      currencies={currencies}
                      placeholder={t("payments.enter_amount")}
                      lockCurrency
                      onFocus={clearError}
                    />
                    {form.amountPaid != null
                      ? (() => {
                          const balance = plan!.price! - form.amountPaid;
                          return (
                            <Text className={`text-sm font-semibold mt-1 ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                              {balance > 0
                                ? t("payments.balance_remaining", { amount: formatAmount(balance, false) })
                                : t("payments.balance_cleared")}
                            </Text>
                          );
                        })()
                      : null}
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Single-month fixed plan */}
            {!isMultiMonth && isFixedPlan && !form.isOverrideEnabled ? (
              <>
                <Text fontWeight="Bold" className="text-4xl text-gray-900">
                  {formatAmount(plan!.price!, false)}
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

            {!isMultiMonth && isFixedPlan && form.isOverrideEnabled ? (
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
                              price: formatAmount(plan!.price!, false),
                            })
                          : t("payments.custom_amount")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {form.amountMode === "custom" ? (
                  <CustomAmountFields
                    form={form}
                    setForm={setForm}
                    currencies={currencies}
                    customCurrency={customCurrency}
                    clearError={clearError}
                    locale={locale}
                  />
                ) : null}
              </>
            ) : null}

            {!isMultiMonth && isCustomOrNoPlan ? (
              <CustomAmountFields
                form={form}
                setForm={setForm}
                currencies={currencies}
                customCurrency={customCurrency}
                clearError={clearError}
                locale={locale}
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
            label={
              resolvedDue !== null && resolvedPaid !== null && resolvedPaid < resolvedDue
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
        </ScrollView>
      </View>
    </Modal>
  );
}

// Custom-amount subform — used in both the override-with-custom path and the
// no-plan/custom-plan path. Renders a full/partial toggle, then either a single
// CurrencyInput or a pair of amount-due/amount-paid CurrencyInputs sharing the
// same selected currency.
function CustomAmountFields({
  form,
  setForm,
  currencies,
  customCurrency,
  clearError,
  locale,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  currencies: import("@/src/core/types").Currency[];
  customCurrency: import("@/src/core/types").Currency | null;
  clearError: () => void;
  locale: string;
}) {
  const { t } = useTranslation();

  function resetAmounts(mode: "full" | "partial") {
    setForm((prev) => ({
      ...prev,
      paymentMode: mode,
      customAmount: null,
      amountDue: null,
      amountPaid: null,
    }));
  }

  return (
    <>
      <View className="w-full gap-2 mb-2">
        {(["full", "partial"] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => resetAmounts(mode)}
            className={`flex-row items-center border rounded-xl px-4 py-3 ${form.paymentMode === mode ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"}`}
          >
            <View className={`w-4 h-4 rounded-full border-2 me-3 items-center justify-center ${form.paymentMode === mode ? "border-primary" : "border-gray-400"}`}>
              {form.paymentMode === mode ? <View className="w-2 h-2 rounded-full bg-primary" /> : null}
            </View>
            <Text className="text-sm text-gray-700">
              {mode === "full" ? t("payments.full_payment") : t("payments.partial_payment")}
            </Text>
          </Pressable>
        ))}
      </View>

      {form.paymentMode === "full" ? (
        <View className="w-full">
          <CurrencyInput
            amount={form.customAmount}
            currencyId={form.customCurrencyId}
            onChange={({ amount, currencyId }) =>
              setForm((prev) => ({ ...prev, customAmount: amount, customCurrencyId: currencyId }))
            }
            currencies={currencies}
            placeholder={t("payments.enter_amount")}
            onFocus={clearError}
          />
        </View>
      ) : (
        <View className="w-full gap-2">
          <CurrencyInput
            label={t("payments.amount_due_label")}
            amount={form.amountDue}
            currencyId={form.customCurrencyId}
            onChange={({ amount, currencyId }) =>
              setForm((prev) => ({ ...prev, amountDue: amount, customCurrencyId: currencyId }))
            }
            currencies={currencies}
            placeholder={t("payments.enter_amount")}
            onFocus={clearError}
          />
          <CurrencyInput
            label={t("payments.amount_paid_label")}
            amount={form.amountPaid}
            currencyId={form.customCurrencyId}
            onChange={({ amount }) =>
              setForm((prev) => ({ ...prev, amountPaid: amount }))
            }
            currencies={currencies}
            placeholder={t("payments.enter_amount")}
            // Lock so the two amounts always share the same unit.
            lockCurrency
            onFocus={clearError}
          />
          {form.amountDue != null && form.amountPaid != null
            ? (() => {
                const balance = form.amountDue - form.amountPaid;
                return (
                  <Text className={`text-sm font-semibold ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {balance > 0
                      ? t("payments.balance_remaining", {
                          amount: formatMoney(balance, customCurrency, customCurrency, locale),
                        })
                      : t("payments.balance_cleared")}
                  </Text>
                );
              })()
            : null}
        </View>
      )}
    </>
  );
}
