import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Charge, Collection, Sale } from "@/src/core/types";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { confirm } from "@/src/shared/lib/confirm";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import {
  buildBillInvoiceText,
  buildCollectionInvoiceText,
  buildSalesInvoiceText,
  type InvoiceContext,
} from "../utils/invoiceText";
import {
  resolveInvoiceRecipient,
  type InvoiceRecipientRow,
} from "../utils/invoiceRecipient";
import { useWhatsApp } from "./useWhatsApp";

const UNREACHABLE_MESSAGE = {
  mixed: "invoice.mixed_customers",
  no_customer: "invoice.no_customer",
  no_phone: "invoice.no_phone",
} as const;

// The one place that turns a saved record into a WhatsApp message. Gathers the
// invoice context from the stores so the four entry points don't each re-wire it.
export function useSendInvoice() {
  const { t } = useTranslation();
  const { canSend, openChat } = useWhatsApp();
  const orgName = useAuthSlice((s) => s.user?.tenant.name ?? "");
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();

  const ctx: InvoiceContext = useMemo(
    () => ({
      t,
      orgName,
      currencies,
      displayCurrencyId,
    }),
    [t, orgName, language, currencies, displayCurrencyId],
  );

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

  const sendCollectionInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string;
      collection: Collection;
    }) =>
      openChat(
        a.phone,
        buildCollectionInvoiceText(ctx, a.customerName, a.collection),
      ),
    [ctx, openChat],
  );

  const sendBillInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string;
      charge: Charge;
      payments: Collection[];
    }) =>
      openChat(
        a.phone,
        buildBillInvoiceText(ctx, a.customerName, a.charge, a.payments),
      ),
    [ctx, openChat],
  );

  const sendSalesInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string | null;
      sales: Sale[];
    }) =>
      openChat(a.phone, buildSalesInvoiceText(ctx, a.sales, a.customerName)),
    [ctx, openChat],
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
    sendBillInvoice,
    sendCollectionInvoice,
    sendSaleInvoice,
    sendSalesInvoice,
  };
}
