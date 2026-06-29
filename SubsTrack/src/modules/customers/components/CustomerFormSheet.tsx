import { useEffect, useRef, useState } from "react";
import { Modal, Switch, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer } from "@/src/core/types";
import {
  CustomerPlansEditor,
  type CustomerPlansEditorHandle,
} from "@/src/modules/customer-plans";
import { getTodayDateString } from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { BRANCH_FILTER_UNASSIGNED } from "@/src/core/constants";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { useCustomerPlanSlice } from "@/src/state/hooks/useCustomerPlanSlice";
import { getStore } from "@/src/state/globalStore";
import { useActiveBranches } from "@/src/modules/branches";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import { UpgradePromptModal } from "@/src/modules/subscription";

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
  branchId: string | null;
  startDate: string;
  isRegular: boolean;
};

export function CustomerFormSheet({ customer, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createCustomer = useCustomerSlice((s) => s.createCustomer);
  const updateCustomer = useCustomerSlice((s) => s.updateCustomer);
  const error = useCustomerSlice((s) => s.error);
  const clearError = useCustomerSlice((s) => s.clearError);
  const tierLimitError = useCustomerSlice((s) => s.tierLimitError);
  const clearTierLimitError = useCustomerSlice((s) => s.clearTierLimitError);
  const syncLines = useCustomerPlanSlice((s) => s.syncLines);
  const planError = useCustomerPlanSlice((s) => s.error);
  const clearPlanError = useCustomerPlanSlice((s) => s.clearError);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const usage = useSubscriptionSlice((s) => s.usage);
  const getPlans = usePlanSlice((s) => s.getPlans);
  const { currentBranchId } = useUiPrefStore();
  const activeBranches = useActiveBranches();

  // For a new customer: default branch is the user's own branch (if scoped),
  // otherwise the currently-selected branch in the header (unless that's "All"
  // or "Unassigned", in which case start unassigned). For an existing customer
  // we always preserve their stored branch.
  const defaultBranchId = (() => {
    if (customer) return customer.branchId;
    if (user?.branchId) return user.branchId;
    if (activeBranches.length === 1) return activeBranches[0].id;
    if (
      currentBranchId === null ||
      currentBranchId === BRANCH_FILTER_UNASSIGNED
    )
      return null;
    return currentBranchId;
  })();

  const [form, setForm] = useState<FormState>({
    name: customer?.name ?? "",
    phoneNumber: customer?.phoneNumber ?? "",
    address: customer?.address ?? "",
    area: customer?.area ?? "",
    notes: customer?.notes ?? "",
    branchId: defaultBranchId,
    startDate: customer?.startDate ?? getTodayDateString(),
    isRegular: customer?.isRegular ?? true,
  });

  const plansEditor = useRef<CustomerPlansEditorHandle>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    clearError();
    clearPlanError();
    getPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        phoneNumber: form.phoneNumber || null,
        address: form.address || null,
        area: form.area || null,
        notes: form.notes || null,
        branchId: form.branchId,
        startDate: form.startDate,
        isRegular: form.isRegular,
      };
      const finalLines = plansEditor.current?.getLines() ?? [];
      const removedIds = plansEditor.current?.getRemovedIds() ?? [];

      if (customer) {
        await updateCustomer(customer.id, payload);
        if (getStore().getState().customers.error) return;
        const ok = await syncLines(customer.id, finalLines, removedIds, user.tenantId);
        if (ok) onDismiss();
      } else {
        if (!currentTier) return;
        const created = await createCustomer(payload, user.tenantId, currentTier, usage);
        if (!created) return; // error / tier-limit surfaced via the banners/modal
        const ok = await syncLines(created.id, finalLines, [], user.tenantId);
        if (ok) onDismiss();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const bannerError = error || planError;
  const clearBanner = () => {
    clearError();
    clearPlanError();
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView className="flex-1 bg-white">
        <ResponsiveContainer className="flex-1">
          {/* Handle + header */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text fontWeight="Bold" className="text-lg text-gray-900">
              {customer ? t("customers.edit_title") : t("customers.add_title")}
            </Text>
            <PressableOpacity onPress={onDismiss}>
              <Text className="text-base text-primary font-medium">
                {t("common.cancel")}
              </Text>
            </PressableOpacity>
          </View>

          <KeyboardAwareScrollView
            className="flex-1 px-6 pt-6"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 48 }}
            bottomOffset={24}
          >
            {bannerError ? (
              <ErrorBanner message={bannerError} onDismiss={clearBanner} />
            ) : null}

            <Input
              label={t("customers.name_label") + " *"}
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
                  label={t("customers.start_date_label") + " *"}
                  value={form.startDate}
                  onChange={(v) =>
                    setForm((prev) => ({ ...prev, startDate: v }))
                  }
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
              label={t("branches.branch_label") + " *"}
              value={form.branchId}
              onChange={(branchId) => setForm((prev) => ({ ...prev, branchId }))}
              nullLabel={t("branches.unassigned")}
              nullable={false}
            />

            {/* Plans (service lines) — add / change / remove inline. */}
            <CustomerPlansEditor
              ref={plansEditor}
              customer={customer}
              branchId={form.branchId}
              startDate={form.startDate}
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
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, isRegular: v }))
                }
              />
            </View>

            <Button
              label={
                customer ? t("common.save_changes") : t("customers.add_title")
              }
              onPress={handleSubmit}
              loading={submitting}
              disabled={!form.name.trim() || !form.startDate || !form.branchId}
              fullWidth
            />
            <View className="h-24" />
          </KeyboardAwareScrollView>
        </ResponsiveContainer>
      </SafeAreaView>
      <UpgradePromptModal
        payload={tierLimitError}
        onClose={() => {
          clearTierLimitError();
          onDismiss();
        }}
      />
    </Modal>
  );
}
