/** Only digits — a number field can also be PASTED into, and web ignores keyboardType. */
export function digitsOnly(next: string): string {
  return next.replace(/[^0-9]/g, "");
}

/** Digits and the decimal point, for an amount the user types. */
export function decimalDigitsOnly(next: string): string {
  return next.replace(/[^0-9.]/g, "");
}

export function upperCaseText(next: string): string {
  return next.toUpperCase();
}

/** A login handle or tenant code: lower case, never a space. */
export function handleText(next: string): string {
  return next.toLowerCase().replace(/\s+/g, "");
}
