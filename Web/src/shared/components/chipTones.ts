import type { Tone } from "@shared/shared/lib/tone";

export type ChipTone = Tone;

const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  emerald: { bg: "#ecfdf5", fg: "#047857" },
  amber: { bg: "#fffbeb", fg: "#b45309" },
  red: { bg: "#fef2f2", fg: "#b91c1c" },
  orange: { bg: "#fff7ed", fg: "#c2410c" },
  sky: { bg: "#f0f9ff", fg: "#0369a1" },
  gray: { bg: "#f3f4f6", fg: "#4b5563" },
  indigo: { bg: "#eef2ff", fg: "#4338ca" },
  teal: { bg: "#f0fdfa", fg: "#0f766e" },
  violet: { bg: "#f5f3ff", fg: "#6d28d9" },
};

export function chipColors(tone: ChipTone): { bg: string; fg: string } {
  return TONES[tone];
}
