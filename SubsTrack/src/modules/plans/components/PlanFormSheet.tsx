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
};

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
  });

  useEffect(() => {
    if (visible) {
      setForm({
        name: plan?.name ?? "",
        isCustomPrice: plan?.isCustomPrice ?? false,
        priceText: plan?.price != null ? String(plan.price) : "",
      });
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, plan]);

  async function handleSubmit() {
    if (!user) return;
    const price = form.isCustomPrice ? null : parseFloat(form.priceText);
    if (plan) {
      await updatePlan(plan.id, {
        name: form.name,
        isCustomPrice: form.isCustomPrice,
        price,
      });
    } else {
      await createPlan(
        { name: form.name, isCustomPrice: form.isCustomPrice, price },
        user.tenantId,
      );
    }
    if (!usePlanStore.getState().error) onDismiss();
  }

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

          {!form.isCustomPrice ? (
            <Input
              label={t("plans.price_label")}
              value={form.priceText}
              onChangeText={(v) =>
                setForm((prev) => ({ ...prev, priceText: v }))
              }
              placeholder="$0.00"
              keyboardType="decimal-pad"
              onFocus={clearError}
            />
          ) : null}

          {/* Custom pricing toggle */}
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

          <Button
            label={plan ? t("common.save_changes") : t("plans.add_title")}
            onPress={handleSubmit}
            loading={loading}
            disabled={
              !form.name.trim() || (!form.isCustomPrice && !form.priceText)
            }
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
