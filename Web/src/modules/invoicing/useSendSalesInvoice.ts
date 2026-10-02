import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Sale } from "@shared/core/types";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import {
  INVOICE_UNREACHABLE_KEYS,
  resolveInvoiceRecipient,
  saleRecipientRows,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import { buildSalesInvoiceText } from "@shared/modules/invoicing/utils/invoiceText";
import { confirm } from "@shared/shared/lib/confirm";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";

// ONE invoice for every sale picked; they must all belong to one customer.
export function useSendSalesInvoice(): (sales: Sale[]) => Promise<void> {
  const { t } = useTranslation();
  const ctx = useInvoiceContext();
  return useCallback(
    async (sales) => {
      const live = sales.filter((sale) => sale.voidedAt === null);
      const to = resolveInvoiceRecipient(saleRecipientRows(live));
      if (to.ok) {
        await openWhatsAppAfterSave(to.phone, buildSalesInvoiceText(ctx, live, to.name));
        return;
      }
      if (to.reason === "empty") return;
      await confirm({
        title: t("common.not_available"),
        message: t(INVOICE_UNREACHABLE_KEYS[to.reason]),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
    },
    [ctx, t],
  );
}
