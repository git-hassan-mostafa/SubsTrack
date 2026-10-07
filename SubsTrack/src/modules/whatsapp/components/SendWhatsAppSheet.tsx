import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Customer, WhatsAppTemplatePurpose } from "@shared/core/types";
import { useSendWhatsAppForm } from "@shared/modules/whatsapp/hooks/useSendWhatsAppForm";
import type { PlaceholderSource } from "@shared/modules/whatsapp/utils/templateValues";
import { Button } from "@/src/shared/components/Button";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Input } from "@/src/shared/components/Input";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";

interface SendWhatsAppSheetProps {
  customers: Customer[];
  purpose?: WhatsAppTemplatePurpose | null;
  onDismiss: () => void;
}

export function SendWhatsAppSheet({
  customers,
  purpose = null,
  onDismiss,
}: SendWhatsAppSheetProps) {
  const { t } = useTranslation();
  const form = useSendWhatsAppForm(customers, purpose);

  if (form.result) {
    const { recentCustomers } = form.result;
    return (
      <FormSheet title={t("whatsapp.send_title")} onDismiss={onDismiss}>
        <View className={`${CARD_SURFACE} p-4 mb-4`}>
          <Text fontWeight="SemiBold" className="text-base text-gray-900 mb-1">
            {form.result.queuedText}
          </Text>
          <Text className="text-xs text-gray-500">
            {t("whatsapp.queued_hint")}
          </Text>
          {form.result.skipTexts.map((text) => (
            <Text key={text} className="text-sm text-gray-700 mt-2">
              {text}
            </Text>
          ))}
        </View>
        {form.error ? <ErrorBanner message={form.error} onDismiss={form.clearError} /> : null}
        {recentCustomers.length > 0 ? (
          <View className="mb-3">
            <Button
              label={t("whatsapp.send_again_anyway", { count: recentCustomers.length })}
              variant="ghost"
              loading={form.sending}
              onPress={() => void form.sendAgain(recentCustomers)}
              fullWidth
            />
          </View>
        ) : null}
        <Button label={t("common.close")} onPress={onDismiss} fullWidth />
      </FormSheet>
    );
  }

  return (
    <FormSheet
      title={t("whatsapp.send_title")}
      subject={t("whatsapp.recipients_count", { count: customers.length })}
      onDismiss={onDismiss}
    >
      {form.error ? <ErrorBanner message={form.error} onDismiss={form.clearError} /> : null}
      {!form.hasTemplates ? (
        <Text className="text-sm text-gray-600 mb-4">
          {t("whatsapp.no_approved_templates")}
        </Text>
      ) : (
        <>
          <View className="mb-4">
            <Dropdown<string>
              label={t("whatsapp.message_type")}
              options={form.templateOptions}
              value={form.templateId}
              onChange={form.pickTemplate}
              searchable
            />
          </View>

          {form.fields.map((field) => (
            <View key={field.param} className="mb-3">
              {field.pickSource ? (
                <Dropdown<PlaceholderSource>
                  label={t("whatsapp.placeholder_label", { name: field.param })}
                  options={form.sourceOptions}
                  value={field.choice.source}
                  onChange={(source) =>
                    source && form.updateChoice(field.param, { source })
                  }
                />
              ) : null}
              {field.choice.source === "custom" ? (
                <Input
                  label={field.textLabel}
                  value={field.choice.text}
                  onChangeText={(text) => form.updateChoice(field.param, { text })}
                  maxLength={field.maxLength}
                  multiline
                />
              ) : null}
            </View>
          ))}

          {form.template ? (
            <View className={`${CARD_SURFACE} p-4 mb-4`}>
              <Text
                fontWeight="SemiBold"
                className="text-xs text-gray-400 uppercase tracking-wide mb-2"
              >
                {t("whatsapp.preview")}
              </Text>
              <Text className="text-sm text-gray-800">{form.preview}</Text>
            </View>
          ) : null}

          <Text className="text-xs text-gray-500 mb-4">
            {t("whatsapp.billing_note")}
          </Text>

          <Button
            label={t("whatsapp.send_button", { count: customers.length })}
            onPress={() => void form.send()}
            loading={form.sending}
            disabled={!form.canSend}
            fullWidth
          />
        </>
      )}
    </FormSheet>
  );
}
