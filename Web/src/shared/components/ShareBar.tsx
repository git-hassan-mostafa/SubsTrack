import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface ShareBarProps {
  share: number;
  color?: string;
  showPercent?: boolean;
}

// A plain bar, no chart library (project rule); the percent beside it carries the number.
export function ShareBar({ share, color = "primary.main", showPercent = true }: ShareBarProps) {
  const width = `${Math.max(0, Math.min(1, share)) * 100}%`;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", width: "100%", height: "100%" }}>
      <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}>
        <Box sx={{ width, height: "100%", bgcolor: color, borderRadius: 4 }} />
      </Box>
      {showPercent ? (
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 40, textAlign: "end" }}>
          {Math.round(share * 100)}%
        </Typography>
      ) : null}
    </Stack>
  );
}
