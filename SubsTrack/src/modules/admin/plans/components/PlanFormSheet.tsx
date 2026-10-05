import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import type { Plan } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { COLORS } from "@/src/shared/constants";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import {
  canSavePlan,
  isMultiMonthPlan,
  planDraftOf,
  planInput,
  withPlanDuration,
} from "@shared/modules/admin/plans/utils/planForm";

interface Props {
  plan?: Plan | null;
  onDismiss: () => void;
  onRequestDelete?: (plan: Plan) => void;
}

const DURATION_OPTIONS = [1, 2, 3, 6, 12];

export function PlanFormSheet({ plan, onDismiss, onRequestDelete }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createPlan = usePlanSlice((s) => s.createPlan);
  const updatePlan = usePlanSlice((s) => s.updatePlan);
  const loading = usePlanSlice((s) => s.loading);
  const error = usePlanSlice((s) => s.error);
  const clearError = usePlanSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const activeBranches = useActiveBranches();

  const branchPickerNullable = user?.branchId === null;

  const [form, setForm] = useState(() =>
    planDraftOf(plan ?? null, defaultNewBranchId(user, activeBranches)),
  );

  const dirty = useDirtyForm(form, ["currencyId"]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const isMultiMonth = isMultiMonthPlan(form);

  function setDuration(months: number) {
    setForm((prev) => withPlanDuration(prev, months));
  }

  async function handleSubmit() {
    if (!user || !canSavePlan(form)) return;
    const data = planInput(form);
    const saved = plan
      ? await updatePlan(plan.id, data)
      : await createPlan(data, user.tenantId);
    if (saved) onDismiss();
  }

  const submitDisabled = !canSavePlan(form) || loading;

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
      title={plan ? t("plans.edit_title") : t("plans.add_title")}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Input
        label={t("plans.plan_name_label") + " *"}
        value={form.name}
        onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
        placeholder={t("plans.plan_name_placeholder")}
        onFocus={clearError}
      />

      <BranchPicker
        label={t("branches.branch_label") + (branchPickerNullable ? "" : " *")}
        value={form.branchId}
        onChange={(v) => setForm((prev) => ({ ...prev, branchId: v }))}
        nullLabel={t("branches.shared_all_branches")}
        nullable={branchPickerNullable}
      />

      <View className="mb-4">
        <Text
          fontWeight="SemiBold"
          className="text-xs text-gray-500 uppercase tracking-wide mb-2"
        >
          {t("plans.duration_label")}
        </Text>

        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {DURATION_OPTIONS.map((d) => {
            const selected = form.durationMonths === d;
            return (
              <PressableOpacity
                key={d}
                onPress={() => setDuration(d)}
                className={`px-4 py-2.5 rounded-xl border ${
                  selected
                    ? "bg-primary border-primary"
                    : "bg-white border-gray-200"
                }`}
              >
                <Text
                  fontWeight="SemiBold"
                  className={`text-sm ${
                    selected ? "text-white" : "text-gray-700"
                  }`}
                >
                  {d === 1
                    ? t("plans.monthly")
                    : t("plans.n_months", { count: d })}
                </Text>
              </PressableOpacity>
            );
          })}
        </View>

        <View className="flex-row items-center justify-between mt-3 px-4 py-2 border border-gray-200 rounded-xl">
          <Text className="text-sm text-gray-700">
            {form.durationMonths === 1
              ? t("plans.monthly")
              : t("plans.n_months", { count: form.durationMonths })}
          </Text>
          <View className="flex-row items-center">
            <PressableOpacity
              onPress={() => setDuration(form.durationMonths - 1)}
              className="w-9 h-9 rounded-lg bg-gray-100 items-center justify-center"
            >
              <Text fontWeight="Bold" className="text-gray-700 text-lg">
                −
              </Text>
            </PressableOpacity>
            <Text
              fontWeight="SemiBold"
              className="text-base text-gray-900 w-10 text-center"
            >
              {form.durationMonths}
            </Text>
            <PressableOpacity
              onPress={() => setDuration(form.durationMonths + 1)}
              className="w-9 h-9 rounded-lg bg-gray-100 items-center justify-center"
            >
              <Text fontWeight="Bold" className="text-gray-700 text-lg">
                +
              </Text>
            </PressableOpacity>
          </View>
        </View>

        <Text className="text-xs text-gray-400 mt-1.5">
          {isMultiMonth ? t("plans.bundle_price_hint") : t("plans.per_month")}
        </Text>
      </View>

      {!form.isCustomPrice ? (
        <CurrencyInput
          label={
            isMultiMonth
              ? t("plans.bundle_price_label") + " *"
              : t("plans.price_label") + " *"
          }
          amount={form.price}
          currencyId={form.currencyId}
          onChange={({ amount, currencyId }) =>
            setForm((prev) => ({ ...prev, price: amount, currencyId }))
          }
          currencies={currencies}
          placeholder="0.00"
          onFocus={clearError}
        />
      ) : null}

      {!isMultiMonth ? (
        <View className="flex-row items-center justify-between py-4 border border-gray-100 rounded-xl px-4 mb-6">
          <View>
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
              {t("plans.custom_pricing_label")}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {t("plans.custom_pricing_hint")}
            </Text>
          </View>
          <Switch
            value={form.isCustomPrice}
            onValueChange={(v) =>
              setForm((prev) => ({ ...prev, isCustomPrice: v }))
            }
            trackColor={{ true: COLORS.primary }}
          />
        </View>
      ) : (
        <View className="mb-6" />
      )}

      <Button
        label={plan ? t("common.save_changes") : t("plans.add_title")}
        onPress={handleSubmit}
        loading={loading}
        disabled={submitDisabled}
        fullWidth
      />

      {plan && onRequestDelete ? (
        <>
          <PressableOpacity
            onPress={() => {
              onRequestDelete(plan);
            }}
            className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
          >
            <Text fontWeight="SemiBold" className="text-red-500">
              {t("common.delete")}
            </Text>
          </PressableOpacity>
          <Text className="text-xs text-gray-400 text-center mt-3">
            {t("plans.delete_warning")}
          </Text>
        </>
      ) : null}

      <View className="h-24" />
    </FormSheet>
  );
}
