import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Sale } from "@/src/core/types";
import { getDateLocale } from "@/src/core/utils/date";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { confirm } from "@/src/shared/lib/confirm";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import {
  buildPaymentInvoiceText,
  buildSalesInvoiceText,
  type InvoiceContext,
  type PaymentInvoiceRow,
} from "../utils/invoiceText";
import {
  resolveInvoiceRecipient,
  type InvoiceRecipientRow,
} from "../utils/invoiceRecipient";

// Why a selection can't be turned into one receipt. "empty" never reaches the
// user — the action is not offered at all.
const UNREACHABLE_MESSAGE = {
  mixed: "invoice.mixed_customers",
  no_customer: "invoice.no_customer",
  no_phone: "invoice.no_phone",
} as const;

// Same reduction openWhatsApp does, so a field holding "-" or "n/a" reads as
// "cannot send" instead of producing a broken wa.me link.
function hasDialableDigits(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length > 0;
}

// The one place that turns a saved record into a WhatsApp message. Gathers the
// invoice context from the stores so the four entry points don't each re-wire it.
export function useSendInvoice() {
  const { t } = useTranslation();
  const orgName = useAuthSlice((s) => s.user?.tenant.name ?? "");
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();

  const ctx: InvoiceContext = useMemo(
    () => ({
      t,
      orgName,
      locale: getDateLocale(language),
      currencies,
      displayCurrencyId,
    }),
    [t, orgName, language, currencies, displayCurrencyId],
  );

  const send = useCallback(
    async (phone: string | null | undefined, text: string) => {
      const ok = await openWhatsApp(phone, text);
      if (!ok) {
        await confirm({
          title: t("invoice.whatsapp_failed"),
          message: t("invoice.whatsapp_failed_message"),
          confirmLabel: t("common.ok"),
          hideCancel: true,
        });
      }
      return ok;
    },
    [t],
  );

  const canSend = useCallback(hasDialableDigits, []);

  // Who a multi-row receipt goes to, or null after explaining why it can't be
  // sent. The action stays visible and speaks up on press (same shape as the
  // pay-order blockers) instead of vanishing as rows are ticked.
  const resolveRecipient = useCallback(
    async (rows: InvoiceRecipientRow[]) => {
      const result = resolveInvoiceRecipient(rows);
      if (result.ok) return result;
      if (result.reason !== "empty") {
        await confirm({
          title: t("common.not_available"),
          message: t(UNREACHABLE_MESSAGE[result.reason]),
          confirmLabel: t("common.close"),
          hideCancel: true,
        });
      }
      return null;
    },
    [t],
  );

  const sendPaymentInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string;
      rows: PaymentInvoiceRow[];
    }) =>
      send(a.phone, buildPaymentInvoiceText(ctx, a.customerName, a.rows)),
    [ctx, send],
  );

  // One receipt covering several sales (a sales-list multi-select). The builder
  // falls back to the single-sale layout for one row, so both entry points below
  // produce the same document a lone sale always did.
  const sendSalesInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string | null;
      sales: Sale[];
    }) => send(a.phone, buildSalesInvoiceText(ctx, a.sales, a.customerName)),
    [ctx, send],
  );

  const sendSaleInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string | null;
      sale: Sale;
    }) => sendSalesInvoice({ ...a, sales: [a.sale] }),
    [sendSalesInvoice],
  );

  return {
    canSend,
    resolveRecipient,
    sendPaymentInvoice,
    sendSaleInvoice,
    sendSalesInvoice,
  };
}
