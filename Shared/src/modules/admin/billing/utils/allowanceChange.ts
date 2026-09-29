// The change field always carries its sign, so +20 and -20 read as movements
// rather than as a second total. Zero shows blank, not "+0".
export function signedText(delta: number): string {
  if (delta === 0) return "";
  return delta > 0 ? `+${delta}` : String(delta);
}
