import { useTranslation } from "react-i18next";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import type { Delta } from "@shared/modules/reports/utils/aggregate";
import type { Tone } from "@shared/shared/lib/tone";
import { chipColors } from "./chipTones";

interface StatCardProps {
  label: string;
  value: string;
  tone: Tone;
  hint?: string | null;
  delta?: Delta;
  higherIsBetter?: boolean;
  href?: string;
}

// No percentage from nothing: a zero previous period shows no comparison at all.
function DeltaLine({ delta, higherIsBetter }: { delta: Delta; higherIsBetter: boolean }) {
  const { t } = useTranslation();
  if (delta.pct === null || delta.pct === 0) return null;
  const up = delta.pct > 0;
  const color = chipColors(up === higherIsBetter ? "emerald" : "red").fg;
  const Arrow = up ? ArrowUpward : ArrowDownward;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Arrow sx={{ fontSize: 16, color }} />
      <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
        {Math.abs(Math.round(delta.pct * 100))}%
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("reports.vs_previous")}
      </Typography>
    </Stack>
  );
}

// One headline number; with `href` the whole card opens the page behind it.
export function StatCard({ label, value, tone, hint, delta, higherIsBetter = true, href }: StatCardProps) {
  const body = (
    <Stack spacing={0.5} sx={{ p: 2, width: "100%", textAlign: "start", alignItems: "flex-start" }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography
        variant="h5"
        component="p"
        sx={{ fontWeight: 700, color: tone === "gray" ? "text.primary" : chipColors(tone).fg }}
      >
        {value}
      </Typography>
      {delta ? <DeltaLine delta={delta} higherIsBetter={higherIsBetter} /> : null}
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Stack>
  );
  return (
    <Paper variant="outlined" sx={{ height: "100%", display: "flex" }}>
      {href ? (
        <ButtonBase
          href={href}
          sx={{ flex: 1, alignItems: "stretch", borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
        >
          {body}
        </ButtonBase>
      ) : (
        body
      )}
    </Paper>
  );
}
