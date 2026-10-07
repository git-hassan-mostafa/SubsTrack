const SHRUNK_LABEL_SCALE = 0.75;
const MAX_CH = 32;

// `ch` is one digit wide, so this leans a little wide and never cuts the text.
export function fieldTextWidth(label: string | undefined, shown: readonly (string | undefined)[]): string {
  const labelCh = Math.ceil((label?.length ?? 0) * SHRUNK_LABEL_SCALE);
  const shownCh = Math.max(0, ...shown.map((text) => text?.length ?? 0));
  return `${Math.min(Math.max(labelCh, shownCh) + 1, MAX_CH)}ch`;
}
