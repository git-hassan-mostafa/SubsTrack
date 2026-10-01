import type { SvgIconComponent } from "@mui/icons-material";
import Chip from "@mui/material/Chip";
import { chipColors, type ChipTone } from "./chipTones";

interface StatusChipProps {
  label: string;
  tone: ChipTone;
  icon?: SvgIconComponent;
}

// One fact per pill, in the phone Chip's tone names and colours.
export function StatusChip({ label, tone, icon: Icon }: StatusChipProps) {
  const colors = chipColors(tone);
  return (
    <Chip
      size="small"
      label={label}
      icon={Icon ? <Icon /> : undefined}
      sx={{
        bgcolor: colors.bg,
        color: colors.fg,
        fontWeight: 600,
        "& .MuiChip-icon": { color: colors.fg, fontSize: 16 },
      }}
    />
  );
}
