import type { Charge, Collection, CollectionItem, Currency, Sale } from "@/src/core/types";
import { formatDate } from "@/src/core/utils/date";
import { receiptId } from "@/src/core/utils/receiptId";
import {
  findCurrency,
  formatMoney,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { getBlockRangeLabel } from "@/src/modules/customer/customer-payments/utils/blockRangeLabel";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface InvoiceContext {
  t: TFn;
  orgName: string;
  locale: string;
  currencies: Currency[];
  displayCurrencyId: string | null;
}

const BULLET = "•";

/**
 * What one line of a hand-over settled. The domain `Charge` carries no joins,
 * so a month reads as its period and the other two fall back to their kind —
 * which is exactly what a customer needs to recognise the row.
 */
function chargeLine(ctx: InvoiceContext, charge: Charge | null | undefined): string {
  if (!charge) return ctx.t("ledger.payment");
  if (charge.kind === "month" && charge.billingMonth) {
    return getBlockRangeLabel(charge.billingMonth, charge.durationMonths, ctx.t);
  }
  if (charge.kind === "sale") return ctx.t("debts.sale");
  return charge.description ?? ctx.t("debts.custom");
}

/**
 * The receipt for ONE hand-over of cash.
 *
 * A collection is single-currency and single-dated, so this message has one
 * amount, one date and one receipt id however many bills the money settled —
 * which is the whole reason the split lives inside it as a list rather than
 * producing several receipts.
 */
export function buildCollectionInvoiceText(
  ctx: InvoiceContext,
  customerName: string,
  collection: Collection,
): string {
  const title = ctx.t("payments.receipt_title");
  const source = snapshotCurrency(collection, ctx.currencies);
  const items = collection.items ?? [];

  const header = [
    row(ctx.t("sales.customer_label"), customerName),
    row(
      ctx.t("payments.amount_paid_label"),
      money(collection.amount, source) +
        equivalent(ctx, collection.amount, source),
    ),
    row(ctx.t("payments.paid_on"), formatDate(collection.receivedAt, ctx.locale)),
  ];

  if (items.length === 1) {
    header.splice(1, 0, row(ctx.t("payments.month_label"), chargeLine(ctx, items[0].charge)));
  }

  const blocks = [header.join("\n")];
  if (items.length > 1) {
    blocks.push(
      [
        ctx.t("ledger.this_pays"),
        ...sortedItems(items).map(
          (it) => `${BULLET} ${chargeLine(ctx, it.charge)}: ${money(it.amount, source)}`,
        ),
      ].join("\n"),
    );
  }
  blocks.push(row(ctx.t("payments.receipt_id"), receiptId(collection.id)));

  return assemble(ctx, title, blocks);
}

// Oldest bill first — a receipt reads as a statement, and the waterfall settled
// them in this order anyway.
function sortedItems(items: CollectionItem[]): CollectionItem[] {
  return [...items].sort((a, b) =>
    (a.charge?.dueDate ?? "").localeCompare(b.charge?.dueDate ?? ""),
  );
}

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

export function buildSaleInvoiceText(
  ctx: InvoiceContext,
  sale: Sale,
  customerName: string | null,
): string {
  const source = snapshotCurrency(sale, ctx.currencies);
  const remaining = sale.totalAmount - sale.amountPaid;

  const itemLines =
    sale.items.length > 0
      ? sale.items.map((it) =>
          it.lineType === "service"
            ? `${BULLET} ${it.itemNameSnapshot}  ${money(it.lineTotal, source)}`
            : `${BULLET} ${it.itemNameSnapshot}  ${it.quantity} × ${money(it.unitAmount, source)} = ${money(it.lineTotal, source)}`,
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

  const sales = [...rows].sort((a, b) => a.soldAt.localeCompare(b.soldAt));
  const currencyOf = (s: Sale) => snapshotCurrency(s, ctx.currencies);
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
