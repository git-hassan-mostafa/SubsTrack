import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Customer, WhatsAppTemplatePurpose } from "@shared/core/types";
import { templateLabel } from "@shared/modules/whatsapp/utils/labels";
import {
  defaultChoices,
  messageLanguage,
  missingCustomText,
  paramMaxLength,
  PLACEHOLDER_SOURCES,
  previewText,
  type PlaceholderChoice,
  type PlaceholderChoices,
  type PlaceholderSource,
} from "@shared/modules/whatsapp/utils/templateValues";
import {
  recentlySentCustomers,
  skipReasonCounts,
  skipReasonText,
} from "@shared/modules/whatsapp/utils/whatsappView";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useUnpaidStartRule } from "@shared/state/hooks/useTenantSettingSlice";
import {
  useOptedOutCustomerIds,
  useSendableTemplates,
  useTemplateForPurpose,
  useWhatsAppSlice,
} from "@shared/state/hooks/useWhatsAppSlice";
import type { WhatsAppSendOutcome } from "@shared/state/slices/whatsapp/whatsappSlice";

export interface TemplateOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SourceOption {
  value: PlaceholderSource;
  label: string;
}

export interface ParamField {
  param: string;
  choice: PlaceholderChoice;
  pickSource: boolean;
  textLabel: string;
  maxLength: number;
}

export interface SendResultView {
  queuedText: string;
  skipTexts: string[];
  recentCustomers: Customer[];
}

// A Sijil template fixes each value's source; the tenant's own lets admins pick.
export function useSendWhatsAppForm(customers: Customer[], purpose: WhatsAppTemplatePurpose | null) {
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

  const templateOptions: TemplateOption[] = sendable.map((x) => ({
    value: x.id,
    label: templateLabel(x, t),
    sublabel: x.isSijil ? undefined : t("whatsapp.own_template"),
  }));

  const sourceOptions: SourceOption[] = PLACEHOLDER_SOURCES.map((source) => ({
    value: source,
    label: t(`whatsapp.source.${source}`),
  }));

  const fields: ParamField[] = template
    ? Object.entries(choices).map(([param, choice]) => ({
        param,
        choice,
        pickSource: !template.isSijil,
        textLabel: template.isSijil ? t(`whatsapp.param.${param}`) : t("whatsapp.custom_text"),
        maxLength: paramMaxLength(template, param),
      }))
    : [];

  function pickTemplate(id: string | null) {
    setTemplateId(id);
    const next = sendable.find((x) => x.id === id);
    setChoices(next ? defaultChoices(next) : {});
  }

  function updateChoice(param: string, patch: Partial<PlaceholderChoice>) {
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

  const preview = template
    ? previewText(template, choices, (source) => t(`whatsapp.source.${source}`))
    : "";

  const skipped = outcome ? [...outcome.localSkipped, ...outcome.result.skipped] : [];
  const resultView: SendResultView | null = outcome
    ? {
        queuedText: t("whatsapp.queued_count", { count: outcome.result.queued }),
        skipTexts: skipReasonCounts(skipped).map(([reason, count]) => skipReasonText(reason, count, t)),
        recentCustomers: recentlySentCustomers(skipped, customers),
      }
    : null;

  return {
    hasTemplates: sendable.length > 0,
    templateOptions,
    sourceOptions,
    templateId,
    template,
    pickTemplate,
    fields,
    updateChoice,
    preview,
    canSend: !!template && missingCustomText(choices).length === 0,
    sending,
    error,
    clearError,
    send: () => runSend(false, customers),
    sendAgain: (targets: Customer[]) => runSend(true, targets),
    result: resultView,
  };
}
