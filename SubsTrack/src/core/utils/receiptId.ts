/** How many trailing characters of the UUID a receipt number is cut from. */
export const RECEIPT_ID_LENGTH = 6;

/**
 * A record's human receipt number — the tail of its UUID, uppercased.
 *
 * Nothing carries a sequence column: an offline device raises a sale or takes a
 * hand-over with no server round trip, so nothing can hand out the next number.
 * The UUID tail is stable, unique in practice at tenant scale, and short enough
 * to read out loud. Keep this the ONE definition — Postgres derives the same
 * number in the `receipt_id(sales)` computed field the web search filters on, so
 * a second copy here would silently stop finding what a card prints.
 */
export function receiptId(id: string): string {
  return id.slice(-RECEIPT_ID_LENGTH).toUpperCase();
}

/** How a sale is named wherever a header or trail has one line for it. */
export function saleTitle(id: string, itemsSummary: string): string {
  return `#${receiptId(id)} · ${itemsSummary}`;
}

/**
 * Does this read as someone typing a receipt number rather than a name?
 *
 * Hex only, so an ordinary product or customer search is never turned into an
 * id lookup — and short, since a longer string cannot be a receipt number.
 */
export function isReceiptIdTerm(term: string): boolean {
  const bare = receiptIdTerm(term);
  return bare.length > 0
    && bare.length <= RECEIPT_ID_LENGTH
    && /^[0-9a-f]+$/.test(bare);
}

/** The bare id characters a receipt-number search matches against. */
export function receiptIdTerm(term: string): string {
  return term.trim().replace(/^#/, '').toLowerCase();
}
