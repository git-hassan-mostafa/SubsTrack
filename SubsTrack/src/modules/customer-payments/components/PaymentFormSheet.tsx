import { useState, useMemo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer, MonthEntry } from "@/src/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePaymentStore } from "../store/paymentStore";
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
  customAmountText: string;
  isOverrideEnabled: boolean;
  amountMode: "plan" | "custom";
  paymentMode: "full" | "partial";
  amountDueText: string;
  amountPaidText: string;
  notes: string;
  conflictConfirmed: boolean;
};

const EMPTY_FORM: FormState = {
  customAmountText: "",
  isOverrideEnabled: false,
  amountMode: "plan",
  paymentMode: "full",
  amountDueText: "",
  amountPaidText: "",
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

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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
  }, [isMultiMonth, plan, entry, monthGrid, t]);

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
  }, [isMultiMonth, plan, entry, monthGrid, t]);

  const hasConflicts = conflictingLabels.length > 0;
  const showConflictWarning = hasConflicts && !form.conflictConfirmed;

  const resolvedAmounts = useMemo((): { amountDue: number | null; amountPaid: number | null } => {
    if (isMultiMonth) {
      const due = plan!.price!;
      if (form.paymentMode === "full") return { amountDue: due, amountPaid: due };
      const paid = parseFloat(form.amountPaidText);
      return { amountDue: due, amountPaid: isNaN(paid) ? null : paid };
    }
    if (isFixedPlan && !form.isOverrideEnabled) return { amountDue: plan!.price!, amountPaid: plan!.price! };
    if (isFixedPlan && form.isOverrideEnabled && form.amountMode === "plan") return { amountDue: plan!.price!, amountPaid: plan!.price! };
    if (form.paymentMode === "full") {
      const v = parseFloat(form.customAmountText);
      return { amountDue: isNaN(v) ? null : v, amountPaid: isNaN(v) ? null : v };
    }
    const due = parseFloat(form.amountDueText);
    const paid = parseFloat(form.amountPaidText);
    return { amountDue: isNaN(due) ? null : due, amountPaid: isNaN(paid) ? null : paid };
  }, [isMultiMonth, isFixedPlan, plan, form]);

  const { amountDue: resolvedDue, amountPaid: resolvedPaid } = resolvedAmounts;
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
          customerId: customer.id,
          planId: customer.planId,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: form.notes.trim() || null,
        },
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
                <Text fontWeight="Bold" className="text-5xl text-gray-900">
                  ${plan!.price!.toFixed(0)}
                  <Text className="text-3xl text-gray-300">
                    .{(plan!.price! % 1).toFixed(2).slice(2)}
                  </Text>
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
                      onPress={() => setForm((prev) => ({ ...prev, paymentMode: mode, amountPaidText: "" }))}
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
                    <Input
                      label={t("payments.amount_paid_label")}
                      value={form.amountPaidText}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, amountPaidText: v }))}
                      placeholder={t("payments.enter_amount")}
                      keyboardType="decimal-pad"
                      onFocus={clearError}
                    />
                    {(() => {
                      const paid = parseFloat(form.amountPaidText);
                      if (!isNaN(paid)) {
                        const balance = plan!.price! - paid;
                        return (
                          <Text className={`text-sm font-semibold mt-1 ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                            {balance > 0
                              ? t("payments.balance_remaining", { amount: balance.toFixed(2) })
                              : t("payments.balance_cleared")}
                          </Text>
                        );
                      }
                      return null;
                    })()}
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Single-month fixed plan */}
            {!isMultiMonth && isFixedPlan && !form.isOverrideEnabled ? (
              <>
                <Text fontWeight="Bold" className="text-5xl text-gray-900">
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
                              price: `$${plan!.price}`,
                            })
                          : t("payments.custom_amount")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {form.amountMode === "custom" ? (
                  <>
                    <View className="w-full gap-2 mt-1">
                      {(["full", "partial"] as const).map((mode) => (
                        <Pressable
                          key={mode}
                          onPress={() => setForm((prev) => ({ ...prev, paymentMode: mode, amountDueText: "", amountPaidText: "", customAmountText: "" }))}
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
                      <View className="w-full mt-2">
                        <Input
                          value={form.customAmountText}
                          onChangeText={(v) => setForm((prev) => ({ ...prev, customAmountText: v }))}
                          placeholder={t("payments.enter_amount")}
                          keyboardType="decimal-pad"
                          onFocus={clearError}
                        />
                      </View>
                    ) : (
                      <View className="w-full mt-2 gap-2">
                        <Input
                          label={t("payments.amount_due_label")}
                          value={form.amountDueText}
                          onChangeText={(v) => setForm((prev) => ({ ...prev, amountDueText: v }))}
                          placeholder={t("payments.enter_amount")}
                          keyboardType="decimal-pad"
                          onFocus={clearError}
                        />
                        <Input
                          label={t("payments.amount_paid_label")}
                          value={form.amountPaidText}
                          onChangeText={(v) => setForm((prev) => ({ ...prev, amountPaidText: v }))}
                          placeholder={t("payments.enter_amount")}
                          keyboardType="decimal-pad"
                          onFocus={clearError}
                        />
                        {(() => {
                          const due = parseFloat(form.amountDueText);
                          const paid = parseFloat(form.amountPaidText);
                          if (!isNaN(due) && !isNaN(paid)) {
                            const balance = due - paid;
                            return (
                              <Text className={`text-sm font-semibold ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                                {balance > 0
                                  ? t("payments.balance_remaining", { amount: balance.toFixed(2) })
                                  : t("payments.balance_cleared")}
                              </Text>
                            );
                          }
                          return null;
                        })()}
                      </View>
                    )}
                  </>
                ) : null}
              </>
            ) : null}

            {!isMultiMonth && isCustomOrNoPlan ? (
              <>
                <View className="w-full gap-2 mb-2">
                  {(["full", "partial"] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setForm((prev) => ({ ...prev, paymentMode: mode, amountDueText: "", amountPaidText: "", customAmountText: "" }))}
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
                  <Input
                    value={form.customAmountText}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, customAmountText: v }))}
                    placeholder={t("payments.enter_amount")}
                    keyboardType="decimal-pad"
                    onFocus={clearError}
                  />
                ) : (
                  <View className="w-full gap-2">
                    <Input
                      label={t("payments.amount_due_label")}
                      value={form.amountDueText}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, amountDueText: v }))}
                      placeholder={t("payments.enter_amount")}
                      keyboardType="decimal-pad"
                      onFocus={clearError}
                    />
                    <Input
                      label={t("payments.amount_paid_label")}
                      value={form.amountPaidText}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, amountPaidText: v }))}
                      placeholder={t("payments.enter_amount")}
                      keyboardType="decimal-pad"
                      onFocus={clearError}
                    />
                    {(() => {
                      const due = parseFloat(form.amountDueText);
                      const paid = parseFloat(form.amountPaidText);
                      if (!isNaN(due) && !isNaN(paid)) {
                        const balance = due - paid;
                        return (
                          <Text className={`text-sm font-semibold ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                            {balance > 0
                              ? t("payments.balance_remaining", { amount: balance.toFixed(2) })
                              : t("payments.balance_cleared")}
                          </Text>
                        );
                      }
                      return null;
                    })()}
                  </View>
                )}
              </>
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
