import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  accountAttentionText,
  accountInfoRows,
  accountStatusTone,
} from "@shared/modules/whatsapp/utils/whatsappView";
import { confirm } from "@shared/shared/lib/confirm";
import { useWhatsAppSignupOptions } from "@shared/state/hooks/useOptionSlice";
import { useWhatsAppSlice } from "@shared/state/hooks/useWhatsAppSlice";

export type OpenConnectPage = (url: string) => void | Promise<void>;

// Each app opens Meta's signup page its own way; the rules stay here.
export function useWhatsAppConnection(openConnectPage: OpenConnectPage) {
  const { t } = useTranslation();
  const account = useWhatsAppSlice((s) => s.account);
  const saving = useWhatsAppSlice((s) => s.saving);
  const startConnect = useWhatsAppSlice((s) => s.startConnect);
  const refresh = useWhatsAppSlice((s) => s.refresh);
  const disconnectAccount = useWhatsAppSlice((s) => s.disconnect);
  const options = useWhatsAppSignupOptions();
  const [consent, setConsent] = useState(false);

  const configured = !!(options.appId && options.configId && options.connectUrl);

  async function connect(confirmed: boolean) {
    const url = await startConnect(confirmed);
    if (url) await openConnectPage(url);
  }

  async function reconnect() {
    const agreed = await confirm({
      title: t("whatsapp.reconnect"),
      message: t("whatsapp.reconnect_confirm"),
      confirmLabel: t("whatsapp.reconnect"),
    });
    if (agreed) await connect(true);
  }

  async function disconnect() {
    const agreed = await confirm({
      title: t("whatsapp.disconnect"),
      message: t("whatsapp.disconnect_confirm"),
      confirmLabel: t("whatsapp.disconnect"),
      destructive: true,
    });
    if (agreed) await disconnectAccount();
  }

  return {
    account,
    saving,
    configured,
    consent,
    toggleConsent: () => setConsent((value) => !value),
    canConnect: consent && configured && !saving,
    connect: () => connect(consent),
    reconnect,
    disconnect,
    refresh,
    statusTone: account ? accountStatusTone(account) : null,
    statusLabel: account ? t(`whatsapp.account_status.${account.status}`) : null,
    attentionText: account ? accountAttentionText(account, t) : null,
    infoRows: account ? accountInfoRows(account, t) : [],
  };
}
