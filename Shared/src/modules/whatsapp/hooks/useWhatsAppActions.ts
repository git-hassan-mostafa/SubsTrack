import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Customer, WhatsAppTemplatePurpose } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import type { OpenWhatsAppChat } from "@shared/modules/invoicing/hooks/useSalesInvoiceSend";
import {
  whatsAppCustomerItems,
  whatsAppSelectionItems,
  type WhatsAppActionKey,
  type WhatsAppMenuFacts,
} from "@shared/modules/whatsapp/utils/whatsappMenu";
import { skipReasonText } from "@shared/modules/whatsapp/utils/whatsappView";
import { confirm } from "@shared/shared/lib/confirm";
import { getStore } from "@shared/state/globalStore";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import {
  useUnpaidStartRule,
  useWhatsAppLanguage,
} from "@shared/state/hooks/useTenantSettingSlice";
import {
  useOptedOutCustomerIds,
  useTemplateForPurpose,
  useWhatsAppReady,
  useWhatsAppSlice,
} from "@shared/state/hooks/useWhatsAppSlice";

export interface WhatsAppSendTarget {
  customers: Customer[];
  purpose: WhatsAppTemplatePurpose | null;
}

// Cloud API sends when connected, the wa.me reminder otherwise; apps add icons.
export function useWhatsAppActions(openChat: OpenWhatsAppChat) {
  const { t, i18n } = useTranslation();
  const { user, isAdmin, whatsappEnabled } = useAuth();
  const cloudEnabled = isAdmin && whatsappEnabled;
  const connected = useWhatsAppReady();
  const ready = cloudEnabled && connected;
  const reminderTemplate = useTemplateForPurpose("payment_reminder");
  const optedOut = useOptedOutCustomerIds();
  const ensureLoaded = useWhatsAppSlice((s) => s.ensureLoaded);
  const setOptOut = useWhatsAppSlice((s) => s.setOptOut);
  const reminderFallbackText = useWhatsAppSlice((s) => s.reminderFallbackText);
  const clearError = useWhatsAppSlice((s) => s.clearError);
  const language = useWhatsAppLanguage();
  const currencies = useCurrencySlice((s) => s.items);
  const unpaidRule = useUnpaidStartRule();
  const [sendTarget, setSendTarget] = useState<WhatsAppSendTarget | null>(null);

  useEffect(() => {
    if (cloudEnabled) void ensureLoaded();
  }, [cloudEnabled, ensureLoaded]);

  const facts: WhatsAppMenuFacts = {
    isAdmin,
    ready,
    reminderReady: !!reminderTemplate,
    optedOutIds: optedOut,
  };

  async function showProblem(message: string) {
    await confirm({
      title: t("whatsapp.problem_title"),
      message,
      confirmLabel: t("common.ok"),
      hideCancel: true,
    });
  }

  async function showSliceError() {
    const message = getStore().getState().whatsapp.error ?? t("common.something_went_wrong");
    clearError();
    await showProblem(message);
  }

  async function sendReminderFallback(customer: Customer) {
    const result = await reminderFallbackText(
      {
        customers: [customer],
        businessName: user?.tenant.name ?? "",
        optedOutCustomerIds: optedOut,
        currencies,
        unpaidRule,
        t: i18n.getFixedT(language),
      },
      language,
    );
    if (!result) {
      await showSliceError();
      return;
    }
    if (!result.text) {
      await showProblem(skipReasonText(result.reason ?? "missing_values", 1, t));
      return;
    }
    if (customer.phoneNumber) await openChat(customer.phoneNumber, result.text);
  }

  async function toggleOptOut(customer: Customer, stop: boolean) {
    const agreed = await confirm({
      title: stop ? t("whatsapp.stop_messages") : t("whatsapp.allow_messages"),
      message: stop
        ? t("whatsapp.stop_messages_confirm", { name: customer.name })
        : t("whatsapp.allow_messages_confirm", { name: customer.name }),
      confirmLabel: t("common.confirm"),
      destructive: stop,
    });
    if (!agreed) return;
    if (!(await setOptOut(customer.id, stop))) await showSliceError();
  }

  function runFor(customers: Customer[]): Record<WhatsAppActionKey, () => void> {
    const [first] = customers;
    return {
      whatsapp_reminder: () =>
        ready
          ? setSendTarget({ customers, purpose: "payment_reminder" })
          : void (first && sendReminderFallback(first)),
      whatsapp_message: () => setSendTarget({ customers, purpose: null }),
      whatsapp_send: () =>
        setSendTarget({ customers, purpose: reminderTemplate ? "payment_reminder" : null }),
      whatsapp_stop: () => void (first && toggleOptOut(first, true)),
      whatsapp_allow: () => void (first && toggleOptOut(first, false)),
    };
  }

  return {
    customerItems: (customer: Customer) => whatsAppCustomerItems(customer, facts),
    selectionItems: (selected: readonly Customer[]) => whatsAppSelectionItems(selected, facts),
    runFor,
    sendTarget,
    closeSend: () => setSendTarget(null),
  };
}
