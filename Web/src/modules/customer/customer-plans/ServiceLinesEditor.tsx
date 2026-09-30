import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import type { LineDrafts } from "@shared/modules/customer/customer-plans/hooks/useLineDrafts";
import type { LineRow } from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { DateField } from "@/shared/components/DateField";
import { PlanFormDialog } from "@/modules/admin/plans/PlanFormDialog";
import { LinePriceField } from "./LinePriceField";
import { PlanPicker } from "./PlanPicker";

interface ServiceLinesEditorProps {
  drafts: LineDrafts;
  branchId: string | null;
}

// The rows and their rules live in Shared useLineDrafts; this only draws them.
export function ServiceLinesEditor({ drafts, branchId }: ServiceLinesEditorProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const multiple = drafts.rows.length > 1;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography component="h3" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {t("subscriptions.section_title")}
        </Typography>
        {multiple ? (
          <Typography variant="body2" color="text.secondary">
            {t("subscriptions.section_subtitle")}
          </Typography>
        ) : null}
      </Stack>
      {drafts.rows.map((row, index) => (
        <ServiceLineCard
          key={row.key}
          row={row}
          index={index}
          drafts={drafts}
          branchId={branchId}
          showHeader={multiple}
          onAddPlan={isAdmin ? () => setAddPlanOpen(true) : undefined}
        />
      ))}
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={drafts.addRow}
        sx={{ alignSelf: "flex-start" }}
      >
        {t("subscriptions.add_plan")}
      </Button>
      {addPlanOpen ? (
        <PlanFormDialog
          plan={null}
          onClose={() => setAddPlanOpen(false)}
          onSaved={() => setAddPlanOpen(false)}
        />
      ) : null}
    </Stack>
  );
}

interface ServiceLineCardProps {
  row: LineRow;
  index: number;
  drafts: LineDrafts;
  branchId: string | null;
  showHeader: boolean;
  onAddPlan?: () => void;
}

// A cancelled line stays read-only until reactivated.
function ServiceLineCard({ row, index, drafts, branchId, showHeader, onAddPlan }: ServiceLineCardProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const cancelled = row.status === "cancelled";
  const dateLocked = drafts.isDateLocked(row);
  const plan = plans.find((p) => p.id === row.planId) ?? null;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, bgcolor: cancelled ? "action.hover" : "background.default" }}
    >
      <Stack spacing={2}>
        {showHeader ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
              {t("subscriptions.line_label", { number: index + 1 })}
              {cancelled ? (
                <Chip size="small" label={t("subscriptions.cancelled_badge")} sx={{ ml: 1 }} />
              ) : null}
            </Typography>
            {cancelled ? (
              <Button
                size="small"
                startIcon={<ReplayOutlined />}
                onClick={() => drafts.reactivateRow(row.key)}
              >
                {t("subscriptions.reactivate_plan")}
              </Button>
            ) : drafts.activeCount > 1 ? (
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlined />}
                loading={drafts.removingKey === row.key}
                onClick={() => void drafts.removeRow(row.key)}
              >
                {t("subscriptions.remove_plan")}
              </Button>
            ) : null}
          </Stack>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <PlanPicker
            value={row.planId}
            onChange={(planId) => drafts.setPlan(row.key, planId)}
            branchId={branchId}
            disabled={cancelled || branchId === null}
            helperText={branchId === null ? t("subscriptions.select_branch_first") : undefined}
            onAddNew={onAddPlan}
          />
          <DateField
            label={t("subscriptions.start_label")}
            value={row.startDate}
            onChange={(date) => drafts.setStartDate(row.key, date)}
            disabled={cancelled || dateLocked}
          />
        </Stack>
        {dateLocked && !cancelled ? (
          <Typography variant="body2" color="text.secondary">
            {t("subscriptions.start_date_locked")}
          </Typography>
        ) : null}
        <LinePriceField
          plan={plan}
          customPrice={row.customPrice}
          customCurrencyId={row.customCurrencyId}
          onPriceChange={(amount, currencyId) => drafts.setPrice(row.key, amount, currencyId)}
          currencies={currencies}
          disabled={cancelled}
        />
      </Stack>
    </Paper>
  );
}
