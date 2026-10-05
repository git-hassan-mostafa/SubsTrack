import { useTranslation } from "react-i18next";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { QuotaKind } from "@shared/modules/admin/billing/utils/types";
import { usageOf, type UsageLevel } from "@shared/modules/admin/billing/utils/usage";

const LEVEL_TONE: Record<UsageLevel, "error" | "warning" | "primary"> = {
  full: "error",
  near: "warning",
  ok: "primary",
};

interface UsageMeterProps {
  kind: QuotaKind;
  used: number;
  total: number;
}

export function UsageMeter({ kind, used, total }: UsageMeterProps) {
  const { t } = useTranslation();
  const usage = usageOf(used, total);
  const tone = LEVEL_TONE[usage.level];

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
        value={usage.percent}
        color={tone}
        aria-label={t(`billing.allowed_${kind}`)}
        sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { transition: "none" } }}
      />
      <Typography variant="body2" color="text.secondary">
        {usage.full
          ? t("billing.usage_full")
          : t(`billing.remaining_${kind}`, { count: usage.remaining })}
      </Typography>
    </Stack>
  );
}
