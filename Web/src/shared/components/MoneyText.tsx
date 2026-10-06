import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface MoneyTextProps {
  primary: string;
  approx?: string | null;
  meta?: string | null;
}

// Amount over its small print, both starting where every other cell's text starts.
export function MoneyText({ primary, approx, meta }: MoneyTextProps) {
  return (
    <Stack sx={{ justifyContent: "center", alignItems: "flex-start", lineHeight: 1.3 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {primary}
      </Typography>
      {approx || meta ? (
        <Typography variant="caption" color="text.secondary">
          {[approx, meta].filter(Boolean).join(" · ")}
        </Typography>
      ) : null}
    </Stack>
  );
}
