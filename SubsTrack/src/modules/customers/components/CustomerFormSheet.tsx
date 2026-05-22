import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Dropdown } from "@/src/shared/components/Dropdown";
import type { DropdownOption } from "@/src/shared/components/Dropdown";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer, Plan } from "@/src/core/types";
import { getTodayDateString } from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePlanStore } from "@/src/modules/plans/store/planStore";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { BRANCH_FILTER_UNASSIGNED } from "@/src/core/constants";
import { useCustomerStore } from "../store/customerStore";

interface Props {
  customer?: Customer | null;
  onDismiss: () => void;
}

type FormState = {
  name: string;
  phoneNumber: string;
  address: string;
  area: string;
  notes: string;
  planId: string | null;
  branchId: string | null;
  startDate: string;
  isRegular: boolean;
};

export function CustomerFormSheet({ customer, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { createCustomer, updateCustomer, loading, error, clearError } =
    useCustomerStore();
  const { plans, getPlans } = usePlanStore();
  const { currentBranchId } = useUiPrefStore();

  // For a new customer: default branch is the user's own branch (if scoped),
  // otherwise the currently-selected branch in the header (unless that's "All"
  // or "Unassigned", in which case start unassigned). For an existing customer
  // we always preserve their stored branch.
  const defaultBranchId = (() => {
    if (customer) return customer.branchId;
    if (user?.branchId) return user.branchId;
    if (currentBranchId === null || currentBranchId === BRANCH_FILTER_UNASSIGNED) return null;
    return currentBranchId;
  })();

  const [form, setForm] = useState<FormState>({
    name: customer?.name ?? "",
    phoneNumber: customer?.phoneNumber ?? "",
    address: customer?.address ?? "",
    area: customer?.area ?? "",
    notes: customer?.notes ?? "",
    planId: customer?.planId ?? null,
    branchId: defaultBranchId,
    startDate: customer?.startDate ?? getTodayDateString(),
    isRegular: customer?.isRegular ?? true,
  });

  useEffect(() => {
    clearError();
    getPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user) return;
    if (!isAdmin) return;
    const payload = {
      name: form.name,
      phoneNumber: form.phoneNumber || null,
      address: form.address || null,
      area: form.area || null,
      notes: form.notes || null,
      planId: form.planId,
      branchId: form.branchId,
      startDate: form.startDate,
      isRegular: form.isRegular,
    };
    if (customer) {
      await updateCustomer(customer.id, payload);
    } else {
      await createCustomer(payload, user.tenantId);
    }
    if (!useCustomerStore.getState().error) onDismiss();
  }

  // Filter plans by the customer's selected branch: branch-specific plans only
  // appear when they match. Shared plans (branchId === null) appear for everyone.
  const planOptions: DropdownOption<string>[] = plans
    .filter((p: Plan) => p.branchId === null || p.branchId === form.branchId)
    .map((p: Plan) => ({
      value: p.id,
      label: p.name,
      sublabel: p.isCustomPrice
        ? t("common.custom_pricing")
        : `$${p.price} / ${p.durationMonths === 1 ? t("plans.per_month") : t("plans.n_months", { count: p.durationMonths })}`,
    }));

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

          <Input
            label={t("customers.area_label")}
            value={form.area}
            onChangeText={(v) => setForm((prev) => ({ ...prev, area: v }))}
            placeholder={t("customers.area_placeholder")}
          />

          <BranchPicker
            value={form.branchId}
            onChange={(v) =>
              setForm((prev) => ({
                ...prev,
                branchId: v,
                // Clear the selected plan if it's branch-specific to a different branch.
                // Shared plans (branchId === null) remain valid for any branch.
                planId:
                  prev.planId &&
                  plans.find((p) => p.id === prev.planId)?.branchId !== null &&
                  plans.find((p) => p.id === prev.planId)?.branchId !== v
                    ? null
                    : prev.planId,
              }))
            }
            nullLabel={t("branches.unassigned")}
            nullSublabel={t("branches.unassigned_hint")}
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

          <Input
            label={t("customers.notes_label")}
            value={form.notes}
            onChangeText={(v) => setForm((prev) => ({ ...prev, notes: v }))}
            placeholder={t("customers.notes_placeholder")}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ minHeight: 80 }}
          />

          {/* Regular customer toggle */}
          <View className="flex-row items-center justify-between py-3 border-t border-gray-100 mb-4">
            <View className="flex-1 me-4">
              <Text fontWeight="SemiBold" className="text-sm text-gray-900">
                {t("customers.regular_label")}
              </Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {t("customers.regular_hint")}
              </Text>
            </View>
            <Switch
              value={form.isRegular}
              onValueChange={(v) => setForm((prev) => ({ ...prev, isRegular: v }))}
            />
          </View>

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
