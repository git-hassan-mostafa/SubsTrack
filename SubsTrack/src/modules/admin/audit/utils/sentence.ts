export interface SentencePart {
  text: string;
  bold: boolean;
}

const OPEN = '\uE000';
const CLOSE = '\uE001';
const MARKERS = /[\uE000\uE001]/g;

// Bold survives translation as a marker pair, not <Trans> — see gotcha #132.
export function bold(value: string): string {
  return `${OPEN}${value.replace(MARKERS, '')}${CLOSE}`;
}

/** Splits an interpolated sentence into runs; an unclosed marker runs to the end. */
export function toParts(sentence: string): SentencePart[] {
  if (!sentence.includes(OPEN)) return [{ text: sentence, bold: false }];

  const parts: SentencePart[] = [];
  let rest = sentence;
  while (rest.length > 0) {
    const open = rest.indexOf(OPEN);
    if (open === -1) {
      parts.push({ text: rest, bold: false });
      break;
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), bold: false });

    const after = rest.slice(open + 1);
    const close = after.indexOf(CLOSE);
    if (close === -1) {
      parts.push({ text: after.replace(MARKERS, ''), bold: true });
      break;
    }
    parts.push({ text: after.slice(0, close), bold: true });
    rest = after.slice(close + 1);
  }
  return parts.filter((p) => p.text.length > 0);
}
