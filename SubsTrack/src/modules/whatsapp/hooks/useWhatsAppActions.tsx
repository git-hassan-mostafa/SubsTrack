import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Customer } from "@shared/core/types";
import { useWhatsAppActions as useSharedWhatsAppActions } from "@shared/modules/whatsapp/hooks/useWhatsAppActions";
import type { WhatsAppActionKey } from "@shared/modules/whatsapp/utils/whatsappMenu";
import { useWhatsApp } from "@/src/modules/invoicing/hooks/useWhatsApp";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import type { SelectionAction } from "@/src/shared/components/SelectionBar";
import { toActionMenuItems, toSelectionActions, type Glyph } from "@/src/shared/lib/menuActions";
import { SendWhatsAppSheet } from "../components/SendWhatsAppSheet";

const WHATSAPP_ACTION_ICONS: Record<WhatsAppActionKey, Glyph> = {
  whatsapp_reminder: "logo-whatsapp",
  whatsapp_message: "chatbubbles-outline",
  whatsapp_send: "logo-whatsapp",
  whatsapp_stop: "notifications-off-outline",
  whatsapp_allow: "notifications-outline",
};

export interface WhatsAppActions {
  rowItems: (customer: Customer) => ActionMenuItem[];
  selectionActions: (selected: Customer[]) => SelectionAction[];
  sheet: ReactNode;
}

export function useWhatsAppActions(): WhatsAppActions {
  const { t } = useTranslation();
  const { openChat } = useWhatsApp();
  const actions = useSharedWhatsAppActions(openChat);

  const rowItems = (customer: Customer) =>
    toActionMenuItems(actions.customerItems(customer), t, {
      icons: WHATSAPP_ACTION_ICONS,
      run: actions.runFor([customer]),
    });

  const selectionActions = (selected: Customer[]) =>
    toSelectionActions(actions.selectionItems(selected), t, {
      icons: WHATSAPP_ACTION_ICONS,
      run: actions.runFor(selected),
    });

  const target = actions.sendTarget;
  const sheet = target ? (
    <SendWhatsAppSheet
      customers={target.customers}
      purpose={target.purpose}
      onDismiss={actions.closeSend}
    />
  ) : null;

  return { rowItems, selectionActions, sheet };
}
