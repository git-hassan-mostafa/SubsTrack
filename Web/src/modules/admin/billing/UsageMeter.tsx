import { useTranslation } from "react-i18next";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { QuotaKind } from "@shared/modules/admin/billing/utils/types";

type Tone = "error" | "warning" | "primary";

interface UsageMeterProps {
  kind: QuotaKind;
  used: number;
  total: number;
}

// Amber from 80%, red when full, like the phone's usage bar.
function toneFor(used: number, total: number): Tone {
  if (total === 0 || used >= total) return "error";
  if (used / total >= 0.8) return "warning";
  return "primary";
}

export function UsageMeter({ kind, used, total }: UsageMeterProps) {
  const { t } = useTranslation();
  const tone = toneFor(used, total);
  const percent = total === 0 ? 100 : Math.min(100, (used / total) * 100);

  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography variant="h5" component="p" color={tone === "primary" ? "text.primary" : `${tone}.main`}>
          {used}
          <Typography component="span" variant="body1" color="text.secondary">
            {` / ${total}`}
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(`billing.used_${kind}`)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percent}
        color={tone}
        aria-label={t(`billing.allowed_${kind}`)}
        sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { transition: "none" } }}
      />
      <Typography variant="body2" color="text.secondary">
        {used >= total
          ? t("billing.usage_full")
          : t(`billing.remaining_${kind}`, { count: Math.max(0, total - used) })}
      </Typography>
    </Stack>
  );
}
