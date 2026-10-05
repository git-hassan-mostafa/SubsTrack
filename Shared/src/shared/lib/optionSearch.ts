// One rule for every searchable picker: a blank term keeps all, else any text matches.
export function matchesOptionSearch(
  term: string,
  ...texts: (string | null | undefined)[]
): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return texts.some((text) => text?.toLowerCase().includes(needle));
}
