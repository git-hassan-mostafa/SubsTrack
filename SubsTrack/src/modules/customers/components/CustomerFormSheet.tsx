import { useEffect } from "react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Dropdown } from "@/src/shared/components/Dropdown";
import type { DropdownOption } from "@/src/shared/components/Dropdown";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer, Plan } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePlanStore } from "@/src/modules/plans/store/planStore";
import { useCustomerStore } from "../store/customerStore";

interface Props {
  visible: boolean;
  customer?: Customer | null;
  onDismiss: () => void;
}

type FormState = {
  name: string;
  phoneNumber: string;
  address: string;
  planId: string | null;
  startDate: string;
};

export function CustomerFormSheet({ visible, customer, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createCustomer, updateCustomer, loading, error, clearError } =
    useCustomerStore();
  const { plans, getPlans } = usePlanStore();

  const [form, setForm] = useState<FormState>({
    name: "",
    phoneNumber: "",
    address: "",
    planId: null,
    startDate: "",
  });

  useEffect(() => {
    if (visible) {
      setForm({
        name: customer?.name ?? "",
        phoneNumber: customer?.phoneNumber ?? "",
        address: customer?.address ?? "",
        planId: customer?.planId ?? null,
        startDate: customer?.startDate ?? "",
      });
      clearError();
      getPlans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customer]);

  async function handleSubmit() {
    if (!user) return;
    const payload = {
      name: form.name,
      phoneNumber: form.phoneNumber || null,
      address: form.address || null,
      planId: form.planId,
      startDate: form.startDate,
    };
    if (customer) {
      await updateCustomer(customer.id, payload);
    } else {
      await createCustomer(payload, user.tenantId);
    }
    if (!useCustomerStore.getState().error) onDismiss();
  }

  const planOptions: DropdownOption<string>[] = plans.map((p: Plan) => ({
    value: p.id,
    label: p.name,
    sublabel: p.isCustomPrice
      ? t("common.custom_pricing")
      : `$${p.price} / month`,
  }));

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
            {customer ? t("customers.edit_title") : t("customers.add_title")}
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
            label={t("customers.name_label")}
            value={form.name}
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
            placeholder={t("customers.name_placeholder")}
            onFocus={clearError}
          />

          {/* Phone + Start Date side by side */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={t("customers.phone_label")}
                value={form.phoneNumber}
                onChangeText={(v) =>
                  setForm((prev) => ({ ...prev, phoneNumber: v }))
                }
                placeholder={t("customers.phone_placeholder")}
                keyboardType="phone-pad"
              />
            </View>
            <View className="flex-1">
              <DatePickerInput
                label={t("customers.start_date_label")}
                value={form.startDate}
                onChange={(v) => setForm((prev) => ({ ...prev, startDate: v }))}
                placeholder={t("customers.start_date_placeholder")}
              />
            </View>
          </View>

          <Input
            label={t("customers.address_label")}
            value={form.address}
            onChangeText={(v) => setForm((prev) => ({ ...prev, address: v }))}
            placeholder={t("common.optional")}
          />

          <Dropdown
            label={t("customers.plan_label")}
            placeholder={t("customers.select_plan")}
            options={planOptions}
            value={form.planId}
            onChange={(v) => setForm((prev) => ({ ...prev, planId: v }))}
            nullable
            nullLabel={t("common.no_plan")}
            nullSublabel={t("customers.custom_plan_sublabel")}
          />

          <Button
            label={
              customer ? t("common.save_changes") : t("customers.add_title")
            }
            onPress={handleSubmit}
            loading={loading}
            disabled={!form.name.trim() || !form.startDate}
            fullWidth
          />
          <View className="h-4" />
        </ScrollView>
      </View>
    </Modal>
  );
}
