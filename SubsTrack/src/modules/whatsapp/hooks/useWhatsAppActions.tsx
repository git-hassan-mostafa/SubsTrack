import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Customer, WhatsAppTemplatePurpose } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useWhatsApp } from "@/src/modules/invoicing/hooks/useWhatsApp";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import type { SelectionAction } from "@/src/shared/components/SelectionBar";
import { confirm } from "@/src/shared/lib/confirm";
import { getStore } from "@/src/state/globalStore";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import {
  useUnpaidStartRule,
  useWhatsAppLanguage,
} from "@/src/state/hooks/useTenantSettingSlice";
import {
  useOptedOutCustomerIds,
  useTemplateForPurpose,
  useWhatsAppReady,
  useWhatsAppSlice,
} from "@/src/state/hooks/useWhatsAppSlice";
import { SendWhatsAppSheet } from "../components/SendWhatsAppSheet";

interface OpenSheet {
  customers: Customer[];
  purpose: WhatsAppTemplatePurpose | null;
}

export interface WhatsAppActions {
  rowItems: (customer: Customer) => ActionMenuItem[];
  selectionAction: (selected: Customer[]) => SelectionAction | null;
  sheet: ReactNode;
}

// Cloud API actions when connected, the wa.me reminder otherwise.
export function useWhatsAppActions(): WhatsAppActions {
  const { t, i18n } = useTranslation();
  const { user, isAdmin } = useAuth();
  const cloudEnabled = isAdmin && !!user?.tenant.whatsappEnabled;
  const connected = useWhatsAppReady();
  const ready = cloudEnabled && connected;
  const reminderTemplate = useTemplateForPurpose("payment_reminder");
  const optedOut = useOptedOutCustomerIds();
  const ensureLoaded = useWhatsAppSlice((s) => s.ensureLoaded);
  const setOptOut = useWhatsAppSlice((s) => s.setOptOut);
  const reminderFallbackText = useWhatsAppSlice((s) => s.reminderFallbackText);
  const language = useWhatsAppLanguage();
  const currencies = useCurrencySlice((s) => s.items);
  const unpaidRule = useUnpaidStartRule();
  const { canSend, openChat } = useWhatsApp();
  const [open, setOpen] = useState<OpenSheet | null>(null);

  useEffect(() => {
    if (cloudEnabled) void ensureLoaded();
  }, [cloudEnabled, ensureLoaded]);

  const showProblem = useCallback(
    async (message: string) => {
      await confirm({
        title: t("whatsapp.problem_title"),
        message,
        confirmLabel: t("common.ok"),
        hideCancel: true,
      });
    },
    [t],
  );

  const sendReminderFallback = useCallback(
    async (customer: Customer) => {
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
        await showProblem(getStore().getState().whatsapp.error ?? t("common.something_went_wrong"));
        return;
      }
      if (!result.text) {
        await showProblem(t(`whatsapp.skip.${result.reason}`, { count: 1 }));
        return;
      }
      await openChat(customer.phoneNumber, result.text);
    },
    [reminderFallbackText, user, optedOut, currencies, unpaidRule, i18n, language, showProblem, t, openChat],
  );

  const toggleOptOut = useCallback(
    async (customer: Customer, stop: boolean) => {
      const agreed = await confirm({
        title: stop ? t("whatsapp.stop_messages") : t("whatsapp.allow_messages"),
        message: stop
          ? t("whatsapp.stop_messages_confirm", { name: customer.name })
          : t("whatsapp.allow_messages_confirm", { name: customer.name }),
        confirmLabel: t("common.confirm"),
        destructive: stop,
      });
      if (!agreed) return;
      const ok = await setOptOut(customer.id, stop);
      if (!ok) {
        await showProblem(getStore().getState().whatsapp.error ?? t("common.something_went_wrong"));
      }
    },
    [setOptOut, showProblem, t],
  );

  const rowItems = useCallback(
    (customer: Customer): ActionMenuItem[] => {
      if (!isAdmin) return [];
      const hasPhone = canSend(customer.phoneNumber);
      if (!ready) {
        if (!hasPhone) return [];
        return [
          {
            key: "whatsapp-reminder",
            group: "send",
            label: t("whatsapp.send_reminder"),
            icon: "logo-whatsapp",
            caption: t("whatsapp.opens_whatsapp"),
            onPress: () => void sendReminderFallback(customer),
          },
        ];
      }
      const isOptedOut = optedOut.has(customer.id);
      const blockedCaption = !hasPhone
        ? t("invoice.no_phone")
        : isOptedOut
          ? t("whatsapp.opted_out_caption")
          : undefined;
      return [
        {
          key: "whatsapp-reminder",
          group: "send",
          label: t("whatsapp.send_reminder"),
          icon: "logo-whatsapp",
          disabled: !!blockedCaption || !reminderTemplate,
          caption: blockedCaption ?? (reminderTemplate ? undefined : t("whatsapp.template_pending")),
          onPress: () => setOpen({ customers: [customer], purpose: "payment_reminder" }),
        },
        {
          key: "whatsapp-message",
          group: "send",
          label: t("whatsapp.send_message"),
          icon: "chatbubbles-outline",
          disabled: !!blockedCaption,
          caption: blockedCaption,
          onPress: () => setOpen({ customers: [customer], purpose: null }),
        },
        {
          key: "whatsapp-opt-out",
          group: "manage",
          label: isOptedOut ? t("whatsapp.allow_messages") : t("whatsapp.stop_messages"),
          icon: isOptedOut ? "notifications-outline" : "notifications-off-outline",
          disabled: !hasPhone,
          onPress: () => void toggleOptOut(customer, !isOptedOut),
        },
      ];
    },
    [isAdmin, canSend, ready, optedOut, reminderTemplate, t, sendReminderFallback, toggleOptOut],
  );

  const selectionAction = useCallback(
    (selected: Customer[]): SelectionAction | null => {
      if (!ready || selected.length === 0) return null;
      return {
        key: "whatsapp-send",
        group: "send",
        icon: "logo-whatsapp",
        label: t("whatsapp.send_on_whatsapp"),
        onPress: () =>
          setOpen({
            customers: selected,
            purpose: reminderTemplate ? "payment_reminder" : null,
          }),
      };
    },
    [ready, reminderTemplate, t],
  );

  const sheet = open ? (
    <SendWhatsAppSheet
      customers={open.customers}
      purpose={open.purpose}
      onDismiss={() => setOpen(null)}
    />
  ) : null;

  return { rowItems, selectionAction, sheet };
}
