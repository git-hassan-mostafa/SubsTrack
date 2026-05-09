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

export function CustomerFormSheet({ visible, customer, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createCustomer, updateCustomer, loading, error, clearError } =
    useCustomerStore();
  const { plans, getPlans } = usePlanStore();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    if (visible) {
      setName(customer?.name ?? "");
      setPhone(customer?.phoneNumber ?? "");
      setAddress(customer?.address ?? "");
      setPlanId(customer?.planId ?? null);
      setStartDate(customer?.startDate ?? "");
      clearError();
      getPlans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customer]);

  async function handleSubmit() {
    if (!user) return;
    if (customer) {
      await updateCustomer(customer.id, {
        name,
        phoneNumber: phone || null,
        address: address || null,
        planId,
      });
    } else {
      await createCustomer(
        {
          name,
          phoneNumber: phone || null,
          address: address || null,
          planId,
          startDate,
        },
        user.tenantId,
      );
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
          <Text className="text-lg font-bold text-gray-900">
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
            label="Full Name"
            value={name}
            onChangeText={setName}
            placeholder={t("customers.name_placeholder")}
            onFocus={clearError}
          />

          {/* Phone + Start Date side by side */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 000 0000"
                keyboardType="phone-pad"
              />
            </View>
            {!customer ? (
              <View className="flex-1">
                <DatePickerInput
                  label="Start Date"
                  value={startDate}
                  onChange={setStartDate}
                  showTime
                  placeholder="YYYY-MM-DD"
                />
              </View>
            ) : null}
          </View>

          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Optional"
          />

          <Dropdown
            label={t("customers.plan_label")}
            placeholder={t("customers.select_plan")}
            options={planOptions}
            value={planId}
            onChange={setPlanId}
            nullable
            nullLabel={t("common.no_plan")}
            nullSublabel="Custom amount each payment"
          />

          <Button
            label={
              customer ? t("common.save_changes") : t("customers.add_title")
            }
            onPress={handleSubmit}
            loading={loading}
            disabled={!name.trim() || (!customer && !startDate)}
            fullWidth
          />
          <View className="h-4" />
        </ScrollView>
      </View>
    </Modal>
  );
}
