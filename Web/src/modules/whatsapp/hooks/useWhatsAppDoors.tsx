import { useTranslation } from "react-i18next";
import type { Customer } from "@shared/core/types";
import { useWhatsAppActions } from "@shared/modules/whatsapp/hooks/useWhatsAppActions";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { SendWhatsAppDialog } from "../components/SendWhatsAppDialog";
import { WHATSAPP_ACTION_ICONS } from "../utils/whatsappActionIcons";

// The reminder text is read before WhatsApp opens, so a blocked tab gets a second click.
export function useWhatsAppDoors() {
  const { t } = useTranslation();
  const actions = useWhatsAppActions(openWhatsAppAfterSave);

  const rowActions = (customer: Customer): TableAction[] =>
    toTableActions(actions.customerItems(customer), t, {
      icons: WHATSAPP_ACTION_ICONS,
      run: actions.runFor([customer]),
    });

  const bulkActions = (customers: Customer[]): TableAction[] =>
    toTableActions(actions.selectionItems(customers), t, {
      icons: WHATSAPP_ACTION_ICONS,
      run: actions.runFor(customers),
    });

  const target = actions.sendTarget;
  const dialog = target ? (
    <SendWhatsAppDialog customers={target.customers} purpose={target.purpose} onClose={actions.closeSend} />
  ) : null;

  return { rowActions, bulkActions, dialog };
}
