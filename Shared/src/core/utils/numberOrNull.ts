// Postgres numeric can arrive as a string; a missing value stays null.
export function numberOrNull(value: number | null | undefined): number | null {
  return value == null ? null : Number(value);
}
