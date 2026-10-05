import type { Customer, Sale } from "@shared/core/types";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";

export interface InvoiceRecipientRow {
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
}

export type InvoiceRecipient =
  | { ok: true; name: string; phone: string }
  | { ok: false; reason: "empty" | "mixed" | "no_customer" | "no_phone" };

export const INVOICE_UNREACHABLE_KEYS = {
  mixed: "invoice.mixed_customers",
  no_customer: "invoice.no_customer",
  no_phone: "invoice.no_phone",
} as const;

export interface ContactRecipient {
  name: string;
  phone: string | null;
}

export function customerRecipient(
  customer: Pick<Customer, "name" | "phoneNumber">,
): ContactRecipient {
  return { name: customer.name, phone: customer.phoneNumber };
}

export function saleRecipient(sale: Pick<Sale, "customer">): ContactRecipient | null {
  return sale.customer ? customerRecipient(sale.customer) : null;
}

// A walk-in sale has nobody to send to; a customer may just lack a number.
export function sendBlockedKey(
  to: Pick<ContactRecipient, "phone"> | null | undefined,
): string | null {
  if (!to) return INVOICE_UNREACHABLE_KEYS.no_customer;
  return canSendWhatsApp(to.phone) ? null : INVOICE_UNREACHABLE_KEYS.no_phone;
}

export function resolveInvoiceRecipient(
  rows: InvoiceRecipientRow[],
): InvoiceRecipient {
  if (rows.length === 0) return { ok: false, reason: "empty" };
  const [first] = rows;
  if (!first.customerId) return { ok: false, reason: "no_customer" };
  if (rows.some((r) => r.customerId !== first.customerId)) {
    return { ok: false, reason: "mixed" };
  }
  if (!canSendWhatsApp(first.phone)) return { ok: false, reason: "no_phone" };
  return { ok: true, name: first.customerName ?? "", phone: first.phone! };
}

export function saleRecipientRows(sales: Sale[]): InvoiceRecipientRow[] {
  return sales.map((sale) => ({
    customerId: sale.customerId,
    customerName: sale.customer?.name ?? null,
    phone: sale.customer?.phoneNumber ?? null,
  }));
}
