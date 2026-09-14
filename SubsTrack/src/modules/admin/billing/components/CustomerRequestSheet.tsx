import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useAuth } from "@/src/modules/authentication/auth";
import { useBillingSlice } from "@/src/state/hooks/useBillingSlice";
import { useSupportWhatsAppNumber } from "@/src/state/hooks/useOptionSlice";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { MIN_CUSTOMER_REQUEST } from "../utils/types";

interface Props {
  editing?: boolean;
  onDismiss: () => void;
}

const digitsOnly = (next: string): string => next.replace(/[^0-9]/g, "");

export function CustomerRequestSheet({ editing = false, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const request = useBillingSlice((s) => s.request);
  const saving = useBillingSlice((s) => s.saving);
  const error = useBillingSlice((s) => s.error);
  const clearError = useBillingSlice((s) => s.clearError);
  const requestMore = useBillingSlice((s) => s.requestMore);
  const editRequest = useBillingSlice((s) => s.editRequest);
  const supportNumber = useSupportWhatsAppNumber();

  const [count, setCount] = useState(
    editing && request ? String(request.requestedCount) : String(MIN_CUSTOMER_REQUEST),
  );
  const dirty = useDirtyForm({ count });

  const parsed = Number(count);
  const valid = Number.isInteger(parsed) && parsed >= MIN_CUSTOMER_REQUEST;

  async function submit(alsoWhatsApp: boolean) {
    if (!user || !valid) return;
    const ok = editing
      ? await editRequest(parsed)
      : await requestMore(user.tenantId, parsed, user.id);
    if (!ok) return;
    if (alsoWhatsApp && supportNumber) {
      void openWhatsApp(
        supportNumber,
        t("billing.whatsapp_request_message", {
          org: user.tenant.name,
          count: parsed,
        }),
      );
    }
    onDismiss();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
      title={editing ? t("billing.edit_request") : t("billing.request_title")}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Text className="text-sm text-gray-600 mb-4">
        {t("billing.request_hint", { min: MIN_CUSTOMER_REQUEST })}
      </Text>

      <Input
        label={t("billing.request_label")}
        value={count}
        onChangeText={setCount}
        sanitize={digitsOnly}
        keyboardType="number-pad"
        maxLength={6}
        error={
          count && !valid
            ? t("billing.request_min_error", { min: MIN_CUSTOMER_REQUEST })
            : null
        }
        onFocus={clearError}
      />

      <Button
        label={editing ? t("billing.save_request") : t("billing.send_request")}
        onPress={() => void submit(false)}
        loading={saving}
        disabled={!valid || saving}
        fullWidth
      />

      {supportNumber ? (
        <PressableOpacity
          onPress={() => void submit(true)}
          disabled={!valid || saving}
          className="border border-green-200 rounded-xl py-3.5 items-center mt-3"
        >
          <Text fontWeight="SemiBold" className="text-green-700">
            {t("billing.send_request_whatsapp")}
          </Text>
        </PressableOpacity>
      ) : null}

      <View className="h-6" />
    </FormSheet>
  );
}
