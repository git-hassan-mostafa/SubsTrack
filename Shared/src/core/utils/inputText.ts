/** Only digits — a number field can also be PASTED into, and web ignores keyboardType. */
export function digitsOnly(next: string): string {
  return next.replace(/[^0-9]/g, "");
}

/** Digits and the decimal point, for an amount the user types. */
export function decimalDigitsOnly(next: string): string {
  return next.replace(/[^0-9.]/g, "");
}

export function amountText(amount: number | null): string {
  return amount != null ? String(amount) : "";
}

// A half-typed "." or an empty box is no amount yet, not a zero.
export function parseAmount(text: string): number | null {
  if (text === "" || text === ".") return null;
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function upperCaseText(next: string): string {
  return next.toUpperCase();
}

/** A login handle or tenant code: lower case, never a space. */
export function handleText(next: string): string {
  return next.toLowerCase().replace(/\s+/g, "");
}
