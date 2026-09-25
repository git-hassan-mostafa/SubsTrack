import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  Customer,
  WhatsAppQueueResult,
  WhatsAppTemplatePurpose,
} from "@/src/core/types";
import { Button } from "@/src/shared/components/Button";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Input } from "@/src/shared/components/Input";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUnpaidStartRule } from "@/src/state/hooks/useTenantSettingSlice";
import {
  useOptedOutCustomerIds,
  useSendableTemplates,
  useTemplateForPurpose,
  useWhatsAppSlice,
} from "@/src/state/hooks/useWhatsAppSlice";
import type { WhatsAppSendOutcome } from "@/src/state/slices/whatsapp/whatsappSlice";
import { templateLabel } from "../utils/labels";
import {
  defaultChoices,
  messageLanguage,
  missingCustomText,
  paramMaxLength,
  PLACEHOLDER_SOURCES,
  previewText,
  type PlaceholderChoices,
  type PlaceholderSource,
} from "../utils/templateValues";

interface SendWhatsAppSheetProps {
  customers: Customer[];
  purpose?: WhatsAppTemplatePurpose | null;
  onDismiss: () => void;
}

type SkipList = WhatsAppQueueResult["skipped"];

function countReasons(skipped: SkipList): [string, number][] {
  const counts = new Map<string, number>();
  for (const { reason } of skipped) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()];
}

export function SendWhatsAppSheet({
  customers,
  purpose = null,
  onDismiss,
}: SendWhatsAppSheetProps) {
  const { t, i18n } = useTranslation();
  const sendable = useSendableTemplates();
  const forPurpose = useTemplateForPurpose(purpose);
  const optedOutCustomerIds = useOptedOutCustomerIds();
  const sending = useWhatsAppSlice((s) => s.sending);
  const error = useWhatsAppSlice((s) => s.error);
  const clearError = useWhatsAppSlice((s) => s.clearError);
  const send = useWhatsAppSlice((s) => s.send);
  const businessName = useAuthSlice((s) => s.user?.tenant.name ?? "");
  const currencies = useCurrencySlice((s) => s.items);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const unpaidRule = useUnpaidStartRule();

  const initial = forPurpose ?? sendable[0] ?? null;

  const [templateId, setTemplateId] = useState<string | null>(initial?.id ?? null);
  const template = sendable.find((x) => x.id === templateId) ?? null;
  const [choices, setChoices] = useState<PlaceholderChoices>(() =>
    initial ? defaultChoices(initial) : {},
  );
  const [outcome, setOutcome] = useState<WhatsAppSendOutcome | null>(null);

  useEffect(() => {
    void getCurrencies();
    return clearError;
  }, [getCurrencies, clearError]);

  const templateOptions: DropdownOption<string>[] = sendable.map((x) => ({
    label: templateLabel(x, t),
    sublabel: x.isSijil ? undefined : t("whatsapp.own_template"),
    value: x.id,
  }));

  const sourceOptions: DropdownOption<PlaceholderSource>[] =
    PLACEHOLDER_SOURCES.map((source) => ({
      label: t(`whatsapp.source.${source}`),
      value: source,
    }));

  function pickTemplate(id: string | null) {
    setTemplateId(id);
    const next = sendable.find((x) => x.id === id);
    setChoices(next ? defaultChoices(next) : {});
  }

  function updateChoice(param: string, patch: Partial<PlaceholderChoices[string]>) {
    setChoices((prev) => ({ ...prev, [param]: { ...prev[param], ...patch } }));
  }

  async function runSend(force: boolean, targets: Customer[]) {
    if (!template) return;
    const result = await send({
      template,
      force,
      build: {
        customers: targets,
        choices,
        businessName,
        optedOutCustomerIds,
        currencies,
        unpaidRule,
        t: i18n.getFixedT(messageLanguage(template, i18n.language)),
      },
    });
    if (result) setOutcome(result);
  }

  const missing = missingCustomText(choices);
  const preview = template
    ? previewText(template, choices, (source) => t(`whatsapp.source.${source}`))
    : "";

  if (outcome) {
    const skipped = [...outcome.localSkipped, ...outcome.result.skipped];
    const recent = skipped.filter((s) => s.reason === "recently_sent");
    const recentCustomers = customers.filter((c) =>
      recent.some((r) => r.customerId === c.id),
    );
    return (
      <FormSheet title={t("whatsapp.send_title")} onDismiss={onDismiss}>
        <View className={`${CARD_SURFACE} p-4 mb-4`}>
          <Text fontWeight="SemiBold" className="text-base text-gray-900 mb-1">
            {t("whatsapp.queued_count", { count: outcome.result.queued })}
          </Text>
          <Text className="text-xs text-gray-500">
            {t("whatsapp.queued_hint")}
          </Text>
          {countReasons(skipped).map(([reason, count]) => (
            <Text key={reason} className="text-sm text-gray-700 mt-2">
              {t(`whatsapp.skip.${reason}`, { count })}
            </Text>
          ))}
        </View>
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        {recentCustomers.length > 0 ? (
          <View className="mb-3">
            <Button
              label={t("whatsapp.send_again_anyway", { count: recentCustomers.length })}
              variant="ghost"
              loading={sending}
              onPress={() => void runSend(true, recentCustomers)}
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
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
      {sendable.length === 0 ? (
        <Text className="text-sm text-gray-600 mb-4">
          {t("whatsapp.no_approved_templates")}
        </Text>
      ) : (
        <>
          <View className="mb-4">
            <Dropdown<string>
              label={t("whatsapp.message_type")}
              options={templateOptions}
              value={templateId}
              onChange={pickTemplate}
            />
          </View>

          {template
            ? Object.entries(choices).map(([param, choice]) => (
                <View key={param} className="mb-3">
                  {template.isSijil ? null : (
                    <Dropdown<PlaceholderSource>
                      label={t("whatsapp.placeholder_label", { name: param })}
                      options={sourceOptions}
                      value={choice.source}
                      onChange={(source) =>
                        source && updateChoice(param, { source })
                      }
                    />
                  )}
                  {choice.source === "custom" ? (
                    <Input
                      label={
                        template.isSijil
                          ? t(`whatsapp.param.${param}`)
                          : t("whatsapp.custom_text")
                      }
                      value={choice.text}
                      onChangeText={(text) => updateChoice(param, { text })}
                      maxLength={paramMaxLength(template, param)}
                      multiline
                    />
                  ) : null}
                </View>
              ))
            : null}

          {template ? (
            <View className={`${CARD_SURFACE} p-4 mb-4`}>
              <Text
                fontWeight="SemiBold"
                className="text-xs text-gray-400 uppercase tracking-wide mb-2"
              >
                {t("whatsapp.preview")}
              </Text>
              <Text className="text-sm text-gray-800">{preview}</Text>
            </View>
          ) : null}

          <Text className="text-xs text-gray-500 mb-4">
            {t("whatsapp.billing_note")}
          </Text>

          <Button
            label={t("whatsapp.send_button", { count: customers.length })}
            onPress={() => void runSend(false, customers)}
            loading={sending}
            disabled={!template || missing.length > 0}
            fullWidth
          />
        </>
      )}
    </FormSheet>
  );
}
