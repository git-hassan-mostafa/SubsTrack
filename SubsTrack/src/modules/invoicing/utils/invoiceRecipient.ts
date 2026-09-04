export interface InvoiceRecipientRow {
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
}

export type InvoiceRecipient =
  | { ok: true; name: string; phone: string }
  | { ok: false; reason: "empty" | "mixed" | "no_customer" | "no_phone" };

// Same reduction openWhatsApp does, so a field holding "-" or "n/a" reads as
// "cannot send" instead of producing a broken wa.me link.
function hasDialableDigits(phone: string | null): boolean {
  return (phone ?? "").replace(/\D/g, "").length > 0;
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
  if (!hasDialableDigits(first.phone)) return { ok: false, reason: "no_phone" };
  return { ok: true, name: first.customerName ?? "", phone: first.phone! };
}
