import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import type { Plan } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePlanStore } from "../store/planStore";
import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";
import { COLORS } from "@/src/shared/constants";
import { useActiveBranches } from "../../branches/hooks/useActiveBranches";

interface Props {
  plan?: Plan | null;
  onDismiss: () => void;
  onRequestDelete?: (plan: Plan) => void;
}

type FormState = {
  name: string;
  isCustomPrice: boolean;
  price: number | null;
  currencyId: string | null;
  branchId: string | null;
  durationMonths: number;
};

const DURATION_OPTIONS = [1, 2, 3, 6, 12];
const MAX_DURATION = 12;

export function PlanFormSheet({ plan, onDismiss, onRequestDelete }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createPlan, updatePlan, loading, error, clearError } = usePlanStore();
  const { currencies } = useCurrencyStore();
  const activeBranches = useActiveBranches();

  // For NEW plans: branch-scoped admin's plans default to their branch;
  // single-branch tenant binds to the only branch (picker is hidden); a
  // tenant-wide admin in a multi-branch tenant starts with no selection and
  // must pick a branch before submit — plans can no longer be SHARED (null).
  const defaultBranchId = (() => {
    if (plan) return plan.branchId;
    if (user?.branchId) return user.branchId;
    if (activeBranches.length === 1) return activeBranches[0].id;
    return null;
  })();

  const [form, setForm] = useState<FormState>({
    name: plan?.name ?? "",
    isCustomPrice: plan?.isCustomPrice ?? false,
    price: plan?.price ?? null,
    currencyId: plan?.currencyId ?? null,
    branchId: defaultBranchId,
    durationMonths: plan?.durationMonths ?? 1,
  });

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMultiMonth = form.durationMonths > 1;

  function setDuration(delta: number) {
    setForm((prev) => ({
      ...prev,
      durationMonths: Math.min(
        MAX_DURATION,
        Math.max(1, prev.durationMonths + delta),
      ),
      isCustomPrice: false, // reset when changing duration
    }));
  }

  async function handleSubmit() {
    if (!user) return;
    const price = form.isCustomPrice ? null : form.price;
    const data = {
      name: form.name,
      isCustomPrice: form.isCustomPrice,
      price,
      currencyId: form.isCustomPrice ? null : form.currencyId,
      branchId: form.branchId,
      durationMonths: form.durationMonths,
    };
    if (plan) {
      await updatePlan(plan.id, data);
    } else {
      await createPlan(data, user.tenantId);
    }
    if (!usePlanStore.getState().error) onDismiss();
  }

  const submitDisabled =
    !form.name.trim() ||
    (!form.isCustomPrice && (form.price == null || form.price <= 0)) ||
    !form.branchId ||
    loading;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        {/* Handle + header */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {plan ? t("plans.edit_title") : t("plans.add_title")}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <Input
            label={t("plans.plan_name_label") + ' *'}
            value={form.name}
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
            placeholder={t("plans.plan_name_placeholder")}
            onFocus={clearError}
          />

          <BranchPicker
            label={t("branches.branch_label") + ' *'}
            value={form.branchId}
            onChange={(v) => setForm((prev) => ({ ...prev, branchId: v }))}
            nullLabel={t("branches.shared_all_branches")}
            nullable={false}
          />

          {/* Duration picker */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {t("plans.duration_label")}
            </Text>

            {/* Preset chips — wrap naturally so labels are never squeezed */}
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {DURATION_OPTIONS.map((d) => {
                const selected = form.durationMonths === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() =>
                      setForm((prev) => ({
                        ...prev,
                        durationMonths: d,
                        isCustomPrice: d > 1 ? false : prev.isCustomPrice,
                      }))
                    }
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
                  </Pressable>
                );
              })}
            </View>

            {/* Fine-tune stepper on its own row */}
            <View className="flex-row items-center justify-between mt-3 px-4 py-2 border border-gray-200 rounded-xl">
              <Text className="text-sm text-gray-700">
                {form.durationMonths === 1
                  ? t("plans.monthly")
                  : t("plans.n_months", { count: form.durationMonths })}
              </Text>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => setDuration(-1)}
                  className="w-9 h-9 rounded-lg bg-gray-100 items-center justify-center"
                >
                  <Text className="text-gray-700 text-lg font-bold">−</Text>
                </Pressable>
                <Text className="text-base font-semibold text-gray-900 w-10 text-center">
                  {form.durationMonths}
                </Text>
                <Pressable
                  onPress={() => setDuration(1)}
                  className="w-9 h-9 rounded-lg bg-gray-100 items-center justify-center"
                >
                  <Text className="text-gray-700 text-lg font-bold">+</Text>
                </Pressable>
              </View>
            </View>

            <Text className="text-xs text-gray-400 mt-1.5">
              {isMultiMonth
                ? t("plans.bundle_price_hint")
                : t("plans.per_month")}
            </Text>
          </View>

          {!form.isCustomPrice ? (
            <CurrencyInput
              label={
                isMultiMonth
                  ? t("plans.bundle_price_label") + ' *'
                  : t("plans.price_label") + ' *'
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

          {/* Custom pricing toggle — hidden for multi-month plans */}
          {!isMultiMonth ? (
            <View className="flex-row items-center justify-between py-4 border border-gray-100 rounded-xl px-4 mb-6">
              <View>
                <Text className="text-sm font-semibold text-gray-900">
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

          {/* Delete plan (edit mode only) */}
          {plan && onRequestDelete ? (
            <>
              <Pressable
                onPress={() => {
                  onRequestDelete(plan);
                }}
                className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
              >
                <Text className="text-red-500 font-semibold">
                  {t("common.delete")}
                </Text>
              </Pressable>
              <Text className="text-xs text-gray-400 text-center mt-3">
                {t("plans.delete_warning")}
              </Text>
            </>
          ) : null}

          <View className="h-10" />
        </ScrollView>
      </View>
    </Modal>
  );
}
