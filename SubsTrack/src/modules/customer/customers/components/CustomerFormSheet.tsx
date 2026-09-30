import { Switch, View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer } from "@shared/core/types";
import {
  CustomerPlansEditor,
  RemovePlanChoice,
} from "@/src/modules/customer/customer-plans";
import { useCustomerForm } from "@shared/modules/customer/customers/hooks/useCustomerForm";
import { QuotaReachedModal } from "@/src/modules/admin/billing";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { LocationField } from "@/src/shared/components/LocationField";
import { PortalAccessField } from "@/src/shared/components/PortalAccessField";
import { useCustomerPortalUrl } from "@shared/state/hooks/useOptionSlice";

interface Props {
  customer?: Customer | null;
  onDismiss: () => void;
}

export function CustomerFormSheet({ customer, onDismiss }: Props) {
  const { t } = useTranslation();
  const quotaError = useBillingSlice((s) => s.quotaError);
  const clearQuotaError = useBillingSlice((s) => s.clearQuotaError);
  const portalBaseUrl = useCustomerPortalUrl();
  const { form, change, lines, dirty, canSubmit, submitting, error, clearError, submit } =
    useCustomerForm(customer ?? null, (onChange) => (
      <RemovePlanChoice onChange={onChange} />
    ));

  async function handleSubmit() {
    if (await submit()) onDismiss();
  }

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
        dirty={dirty}
        title={customer ? t("customers.edit_title") : t("customers.add_title")}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        <Input
          label={t("customers.name_label") + " *"}
          value={form.name}
          onChangeText={(v) => change({ name: v })}
          placeholder={t("customers.name_placeholder")}
          autoCapitalize="words"
          onFocus={clearError}
        />

        <Input
          label={t("customers.phone_label")}
          value={form.phoneNumber}
          onChangeText={(v) => change({ phoneNumber: v })}
          placeholder={t("customers.phone_placeholder")}
          keyboardType="phone-pad"
        />

        <Input
          label={t("customers.address_label")}
          value={form.address}
          onChangeText={(v) => change({ address: v })}
          placeholder={t("common.optional")}
        />

        <Input
          label={t("customers.area_label")}
          value={form.area}
          onChangeText={(v) => change({ area: v })}
          placeholder={t("customers.area_placeholder")}
        />

        <LocationField
          value={form.locationUrl}
          onChange={(v) => change({ locationUrl: v })}
        />

        <BranchPicker
          label={t("branches.branch_label") + " *"}
          value={form.branchId}
          onChange={(branchId) => change({ branchId })}
          nullLabel={t("branches.unassigned")}
          nullable={false}
        />

        <CustomerPlansEditor drafts={lines} branchId={form.branchId} />

        <Input
          label={t("customers.notes_label")}
          value={form.notes}
          onChangeText={(v) => change({ notes: v })}
          placeholder={t("customers.notes_placeholder")}
          multiline
          style={{ minHeight: 80 }}
        />

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
              change({ isRegular: v })
            }
          />
        </View>

        <PortalAccessField
          customerId={customer?.id ?? null}
          portalBaseUrl={portalBaseUrl}
          enabled={form.portalEnabled}
          password={form.portalPassword}
          onEnabledChange={(v) =>
            change({ portalEnabled: v })
          }
          onPasswordChange={(v) =>
            change({ portalPassword: v })
          }
        />

        <Button
          label={customer ? t("common.save_changes") : t("customers.add_title")}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
          fullWidth
        />
        <View className="h-24" />
      </FormSheet>
      <QuotaReachedModal
        payload={quotaError}
        onClose={clearQuotaError}
        onNavigate={onDismiss}
      />
    </>
  );
}
