import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { chipColors, type ChipTone } from "./chipTones";

interface DialogHeadingProps {
  id: string;
  icon: SvgIconComponent;
  tone: ChipTone;
  kind: string;
  title: string;
  subtitle?: string | null;
}

// A record dialog's title: what KIND of record it is, then which one, then whose.
export function DialogHeading({ id, icon: Icon, tone, kind, title, subtitle }: DialogHeadingProps) {
  const colors = chipColors(tone);
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 1.5,
          bgcolor: colors.bg,
          color: colors.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{ color: colors.fg, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}
        >
          {kind}
        </Typography>
        <Typography id={id} variant="h6" component="h2" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" noWrap>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}
