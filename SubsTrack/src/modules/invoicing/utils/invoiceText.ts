// Builds the plain-text invoice sent to a customer over WhatsApp. Pure — no
// React, no store, no i18n singleton: `t` arrives in the context (the same
// pattern as blockRangeLabel.ts). One file owns the whole message format, so a
// payment receipt and a sale receipt always look like the same document.
//
// Format notes (WhatsApp markup):
//   - only the org name is bolded (`*name*`); nothing that can hold user-typed
//     `*`, `_` or `~` is ever wrapped, or the markup breaks.
//   - list rows start with a literal `•`. A leading `*` or `-` would be read as
//     markup by WhatsApp.

import type { Currency, Payment, Sale } from "@/src/core/types";
import { formatDate } from "@/src/core/utils/date";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
// Deep import on purpose: the customer-payments barrel re-exports screens, and
// pulling UI into a pure util would defeat the point.
import { getBlockRangeLabel } from "@/src/modules/customer/customer-payments/utils/blockRangeLabel";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface InvoiceContext {
  t: TFn;
  orgName: string;
  // For formatDate. Always the Latin locale — formatMoney hardcodes en-US, so an
  // "ar" date would mix Arabic-Indic and Latin digits in one message.
  locale: string;
  currencies: Currency[];
  // The optional "≈ …" target. null = USD.
  displayCurrencyId: string | null;
}

/** One paid service line. `planName` is null for a plan-less line. */
export interface PaymentInvoiceRow {
  payment: Payment;
  planName: string | null;
}

const BULLET = "•";

// Joins the blocks with blank lines between them, dropping empties so an absent
// section never leaves a double gap.
function assemble(ctx: InvoiceContext, title: string, blocks: string[]): string {
  const body = blocks.filter((b) => b.trim().length > 0).join("\n\n");
  const header = ctx.orgName ? `*${ctx.orgName}*\n${title}` : title;
  return `${header}\n\n${body}\n\n${ctx.t("invoice.thank_you")}`;
}

function row(label: string, value: string): string {
  return `${label}: ${value}`;
}

// Money as actually collected, at the row's frozen snapshot rate.
function money(amount: number, source: Currency | null): string {
  return formatMoney(amount, source, source);
}

// The "≈ display currency" suffix, added to the ONE headline amount only —
// on every line it makes the message unreadable.
function equivalent(
  ctx: InvoiceContext,
  amount: number,
  source: Currency | null,
): string {
  const target = findCurrency(ctx.currencies, ctx.displayCurrencyId);
  if ((source?.id ?? null) === (target?.id ?? null)) return "";
  return ` (≈ ${formatMoney(amount, source, target)})`;
}

function receiptId(id: string): string {
  return id.slice(-6).toUpperCase();
}

// Totals are grouped PER CURRENCY, never summed numerically: each row can carry
// its own currency, so one number would be meaningless.
function sumByCurrency<T>(
  rows: T[],
  amountOf: (r: T) => number,
  currencyOf: (r: T) => Currency | null,
): { source: Currency | null; sum: number }[] {
  const groups = new Map<string, { source: Currency | null; sum: number }>();
  for (const r of rows) {
    const source = currencyOf(r);
    const key = source?.id ?? "USD";
    const group = groups.get(key) ?? { source, sum: 0 };
    group.sum += amountOf(r);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function totalsByCurrency(
  ctx: InvoiceContext,
  rows: PaymentInvoiceRow[],
): string[] {
  // "Total paid", not "Total": these sum amountPaid, and a bare "Total" next to a
  // line that still owes a balance reads as "nothing is owed".
  return sumByCurrency(
    rows,
    (r) => r.payment.amountPaid,
    (r) => paymentSnapshotCurrency(r.payment, ctx.currencies),
  ).map(({ source, sum }) =>
    row(ctx.t("invoice.total_paid"), money(sum, source)),
  );
}

// The month (or month range for a multi-month bundle) plus the plan name.
function periodLabel(ctx: InvoiceContext, r: PaymentInvoiceRow): string {
  const months = getBlockRangeLabel(
    r.payment.billingMonth,
    r.payment.durationMonths,
    ctx.t,
  );
  return r.planName ? `${months} · ${r.planName}` : months;
}

export function buildPaymentInvoiceText(
  ctx: InvoiceContext,
  customerName: string,
  rows: PaymentInvoiceRow[],
): string {
  const title = ctx.t("payments.receipt_title");
  if (rows.length === 0) return assemble(ctx, title, []);

  if (rows.length === 1) {
    const { payment } = rows[0];
    const source = paymentSnapshotCurrency(payment, ctx.currencies);
    const lines = [
      row(ctx.t("sales.customer_label"), customerName),
      row(ctx.t("payments.month_label"), periodLabel(ctx, rows[0])),
      row(ctx.t("payments.amount_due_label"), money(payment.amountDue, source)),
      row(
        ctx.t("payments.amount_paid_label"),
        money(payment.amountPaid, source) +
          equivalent(ctx, payment.amountPaid, source),
      ),
    ];
    if (payment.balance > 0) {
      lines.push(
        row(ctx.t("sales.remaining_label"), money(payment.balance, source)),
      );
    }
    lines.push(
      row(ctx.t("payments.paid_on"), formatDate(payment.paidAt, ctx.locale)),
      row(ctx.t("payments.receipt_id"), receiptId(payment.id)),
    );
    return assemble(ctx, title, [lines.join("\n")]);
  }

  // Several months in one message — either paid together (quick pay) or picked
  // from the grid/list afterwards. One bullet per line, then a total per
  // currency, then every receipt id.
  // Oldest month first: a receipt reads as a statement, and a selection reaches
  // us in list order (newest first). Stable, so several lines of the SAME month
  // (a multi-plan quick pay) keep their order.
  const ordered = [...rows].sort((a, b) =>
    a.payment.billingMonth.localeCompare(b.payment.billingMonth),
  );
  // Paid together → one "Paid on" header; months collected on different days
  // date each bullet instead, or the header would speak for all of them.
  const dates = ordered.map((r) => formatDate(r.payment.paidAt, ctx.locale));
  const oneDate = dates.every((d) => d === dates[0]);

  const bullets = ordered.map((r, i) => {
    const source = paymentSnapshotCurrency(r.payment, ctx.currencies);
    const remaining =
      r.payment.balance > 0
        ? ` (${ctx.t("sales.remaining_label")}: ${money(r.payment.balance, source)})`
        : "";
    const when = oneDate ? "" : ` · ${dates[i]}`;
    return `${BULLET} ${periodLabel(ctx, r)}: ${money(r.payment.amountPaid, source)}${remaining}${when}`;
  });

  const header = [row(ctx.t("sales.customer_label"), customerName)];
  if (oneDate) header.push(row(ctx.t("payments.paid_on"), dates[0]));

  return assemble(ctx, title, [
    header.join("\n"),
    bullets.join("\n"),
    [
      ...totalsByCurrency(ctx, ordered),
      row(
        ctx.t("payments.receipt_id"),
        ordered.map((r) => receiptId(r.payment.id)).join(", "),
      ),
    ].join("\n"),
  ]);
}

export function buildSaleInvoiceText(
  ctx: InvoiceContext,
  sale: Sale,
  customerName: string | null,
): string {
  const source = paymentSnapshotCurrency(sale, ctx.currencies);
  const remaining = sale.totalAmount - sale.amountPaid;

  // sale.items is empty on lean reads — the frozen summary is the fallback.
  const itemLines =
    sale.items.length > 0
      ? sale.items.map(
          (it) =>
            `${BULLET} ${it.productNameSnapshot}  ${it.quantity} × ${money(it.unitAmount, source)} = ${money(it.lineTotal, source)}`,
        )
      : [`${BULLET} ${sale.itemsSummary}`];

  const totals = [
    row(
      ctx.t("sales.total_label"),
      money(sale.totalAmount, source) +
        equivalent(ctx, sale.totalAmount, source),
    ),
    row(ctx.t("sales.paid_label"), money(sale.amountPaid, source)),
  ];
  if (remaining > 0) {
    totals.push(row(ctx.t("sales.remaining_label"), money(remaining, source)));
  }
  totals.push(
    row(ctx.t("sales.sold_at_label"), formatDate(sale.soldAt, ctx.locale)),
    row(ctx.t("sales.receipt_id_label"), receiptId(sale.id)),
  );

  return assemble(ctx, ctx.t("sales.receipt_title"), [
    row(ctx.t("sales.customer_label"), customerName ?? ctx.t("sales.walk_in")),
    itemLines.join("\n"),
    totals.join("\n"),
  ]);
}

// Several sales in one receipt (a multi-select in the sales list). Each sale is
// one bullet built from its FROZEN items_summary — listing every product of
// every sale would bury the totals.
export function buildSalesInvoiceText(
  ctx: InvoiceContext,
  rows: Sale[],
  customerName: string | null,
): string {
  const title = ctx.t("sales.receipt_title");
  if (rows.length === 0) return assemble(ctx, title, []);
  if (rows.length === 1) {
    return buildSaleInvoiceText(ctx, rows[0], customerName);
  }

  // Oldest sale first — the list hands us newest-first.
  const sales = [...rows].sort((a, b) => a.soldAt.localeCompare(b.soldAt));
  const currencyOf = (s: Sale) => paymentSnapshotCurrency(s, ctx.currencies);
  const remainingOf = (s: Sale) => s.totalAmount - s.amountPaid;

  const bullets = sales.map((sale) => {
    const source = currencyOf(sale);
    const remaining = remainingOf(sale);
    const owed =
      remaining > 0
        ? ` (${ctx.t("sales.remaining_label")}: ${money(remaining, source)})`
        : "";
    return `${BULLET} ${formatDate(sale.soldAt, ctx.locale)} · ${sale.itemsSummary}: ${money(sale.totalAmount, source)}${owed}`;
  });

  const totals = [
    ...sumByCurrency(sales, (s) => s.totalAmount, currencyOf).map(
      ({ source, sum }) =>
        row(
          ctx.t("sales.total_label"),
          money(sum, source) + equivalent(ctx, sum, source),
        ),
    ),
    ...sumByCurrency(sales, (s) => s.amountPaid, currencyOf).map(
      ({ source, sum }) => row(ctx.t("sales.paid_label"), money(sum, source)),
    ),
    ...sumByCurrency(sales, remainingOf, currencyOf)
      .filter((g) => g.sum > 0)
      .map(({ source, sum }) =>
        row(ctx.t("sales.remaining_label"), money(sum, source)),
      ),
    row(
      ctx.t("sales.receipt_id_label"),
      sales.map((s) => receiptId(s.id)).join(", "),
    ),
  ];

  return assemble(ctx, title, [
    row(ctx.t("sales.customer_label"), customerName ?? ctx.t("sales.walk_in")),
    bullets.join("\n"),
    totals.join("\n"),
  ]);
}
