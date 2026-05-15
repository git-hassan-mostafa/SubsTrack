import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Plan } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePlanStore } from "../store/planStore";
import { COLORS } from "@/src/shared/constants";

interface Props {
  visible: boolean;
  plan?: Plan | null;
  onDismiss: () => void;
  onRequestDelete?: (plan: Plan) => void;
}

type FormState = {
  name: string;
  isCustomPrice: boolean;
  priceText: string;
  durationMonths: number;
};

const DURATION_OPTIONS = [1, 2, 3, 6, 12];
const MAX_DURATION = 12;

export function PlanFormSheet({
  visible,
  plan,
  onDismiss,
  onRequestDelete,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createPlan, updatePlan, loading, error, clearError } = usePlanStore();

  const [form, setForm] = useState<FormState>({
    name: "",
    isCustomPrice: false,
    priceText: "",
    durationMonths: 1,
  });

  useEffect(() => {
    if (visible) {
      setForm({
        name: plan?.name ?? "",
        isCustomPrice: plan?.isCustomPrice ?? false,
        priceText: plan?.price != null ? String(plan.price) : "",
        durationMonths: plan?.durationMonths ?? 1,
      });
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, plan]);

  const isMultiMonth = form.durationMonths > 1;

  function setDuration(delta: number) {
    setForm((prev) => ({
      ...prev,
      durationMonths: Math.min(MAX_DURATION, Math.max(1, prev.durationMonths + delta)),
      isCustomPrice: false, // reset when changing duration
    }));
  }

  async function handleSubmit() {
    if (!user) return;
    const price = form.isCustomPrice ? null : parseFloat(form.priceText);
    const data = {
      name: form.name,
      isCustomPrice: form.isCustomPrice,
      price,
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
    (!form.isCustomPrice && !form.priceText) ||
    loading;

  return (
    <Modal
      visible={visible}
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
            label={t("plans.plan_name_label")}
            value={form.name}
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
            placeholder={t("plans.plan_name_placeholder")}
            onFocus={clearError}
          />

          {/* Duration picker */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {t("plans.duration_label")}
            </Text>
            <View className="flex-row items-center gap-2">
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      durationMonths: d,
                      isCustomPrice: d > 1 ? false : prev.isCustomPrice,
                    }))
                  }
                  className={`flex-1 py-2.5 rounded-xl items-center border ${
                    form.durationMonths === d
                      ? "bg-primary border-primary"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <Text
                    fontWeight="SemiBold"
                    className={`text-sm ${
                      form.durationMonths === d ? "text-white" : "text-gray-700"
                    }`}
                  >
                    {d === 1 ? t("plans.monthly") : t("plans.n_months", { count: d })}
                  </Text>
                </Pressable>
              ))}
              {/* Custom duration input if not in presets */}
              <View className="flex-row items-center border border-gray-200 rounded-xl px-2">
                <Pressable onPress={() => setDuration(-1)} className="p-2">
                  <Text className="text-gray-700 text-base font-bold">−</Text>
                </Pressable>
                <Text className="text-sm font-semibold text-gray-900 w-6 text-center">
                  {form.durationMonths}
                </Text>
                <Pressable onPress={() => setDuration(1)} className="p-2">
                  <Text className="text-gray-700 text-base font-bold">+</Text>
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
            <Input
              label={isMultiMonth ? t("plans.bundle_price_label") : t("plans.price_label")}
              value={form.priceText}
              onChangeText={(v) =>
                setForm((prev) => ({ ...prev, priceText: v }))
              }
              placeholder="$0.00"
              keyboardType="decimal-pad"
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

          <View className="h-4" />
        </ScrollView>
      </View>
    </Modal>
  );
}
