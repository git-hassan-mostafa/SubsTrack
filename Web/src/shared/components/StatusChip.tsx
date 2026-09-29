import Chip from "@mui/material/Chip";

export type ChipTone =
  | "emerald"
  | "amber"
  | "red"
  | "orange"
  | "sky"
  | "gray"
  | "indigo"
  | "teal"
  | "violet";

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

interface StatusChipProps {
  label: string;
  tone: ChipTone;
}

// One fact per pill, in the phone Chip's tone names and colours.
export function StatusChip({ label, tone }: StatusChipProps) {
  const colors = TONES[tone];
  return (
    <Chip
      size="small"
      label={label}
      sx={{ bgcolor: colors.bg, color: colors.fg, fontWeight: 600 }}
    />
  );
}
