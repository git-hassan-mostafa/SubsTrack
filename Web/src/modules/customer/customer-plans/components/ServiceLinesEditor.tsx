import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import type { LineDrafts } from "@shared/modules/customer/customer-plans/hooks/useLineDrafts";
import type { LineRow } from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { DateField } from "@/shared/components/DateField";
import { PriceStartField } from "@/shared/components/PriceStartField";
import { PlanFormDialog } from "@/modules/admin/plans/components/PlanFormDialog";
import { LinePriceField } from "./LinePriceField";
import { PlanPicker } from "./PlanPicker";

interface ServiceLinesEditorProps {
  drafts: LineDrafts;
  branchId: string | null;
}

// The rows and their rules live in Shared useLineDrafts; this only draws them.
export function ServiceLinesEditor({ drafts, branchId }: ServiceLinesEditorProps) {
  const { t } = useTranslation();
  const [addPlanOpen, setAddPlanOpen] = useState(false);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography component="h3" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {t("subscriptions.section_title")}
        </Typography>
        {drafts.rows.length > 1 ? (
          <Typography variant="body2" color="text.secondary">
            {t("subscriptions.section_subtitle")}
          </Typography>
        ) : null}
      </Stack>
      {branchId === null ? (
        <Typography variant="body2" color="text.secondary">
          {t("subscriptions.select_branch_first")}
        </Typography>
      ) : null}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label={t("subscriptions.section_title")} sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("customers.plan_label")}</TableCell>
              <TableCell sx={{ width: 180 }}>{t("subscriptions.start_label")}</TableCell>
              <TableCell sx={{ width: 300 }}>{t("plans.price_label")}</TableCell>
              <TableCell sx={{ width: 56 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {drafts.rows.map((row) => (
              <ServiceLineRow
                key={row.key}
                row={row}
                drafts={drafts}
                branchId={branchId}
                onAddPlan={() => setAddPlanOpen(true)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
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

interface ServiceLineRowProps {
  row: LineRow;
  drafts: LineDrafts;
  branchId: string | null;
  onAddPlan?: () => void;
}

// A cancelled line stays read-only until reactivated.
function ServiceLineRow({ row, drafts, branchId, onAddPlan }: ServiceLineRowProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const cancelled = row.status === "cancelled";
  const dateLocked = drafts.isDateLocked(row);
  const plan = plans.find((p) => p.id === row.planId) ?? null;

  return (
    <TableRow sx={{ bgcolor: cancelled ? "action.hover" : undefined }}>
      <TableCell>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <PlanPicker
            value={row.planId}
            onChange={(planId) => drafts.setPlan(row.key, planId)}
            branchId={branchId}
            disabled={cancelled || branchId === null}
            onAddNew={onAddPlan}
          />
          {cancelled ? <Chip size="small" label={t("subscriptions.cancelled_badge")} /> : null}
        </Stack>
      </TableCell>
      <TableCell>
        <Tooltip title={dateLocked && !cancelled ? t("subscriptions.start_date_locked") : ""}>
          <Box>
            <DateField
              label={t("subscriptions.start_label")}
              value={row.startDate}
              onChange={(date) => drafts.setStartDate(row.key, date)}
              disabled={cancelled || dateLocked}
              size="small"
              hideLabel
            />
          </Box>
        </Tooltip>
      </TableCell>
      <TableCell>
        <LinePriceField
          plan={plan}
          customPrice={row.customPrice}
          customCurrencyId={row.customCurrencyId}
          onPriceChange={(amount, currencyId) => drafts.setPrice(row.key, amount, currencyId)}
          currencies={currencies}
          disabled={cancelled}
        />
        {drafts.priceChanged(row) ? (
          <Box sx={{ mt: 1.5 }}>
            <PriceStartField
              value={row.priceFrom}
              onChange={(month) => drafts.setPriceFrom(row.key, month)}
              size="small"
            />
          </Box>
        ) : null}
      </TableCell>
      <TableCell align="right">
        {cancelled ? (
          <Tooltip title={t("subscriptions.reactivate_plan")}>
            <IconButton
              aria-label={t("subscriptions.reactivate_plan")}
              onClick={() => drafts.reactivateRow(row.key)}
            >
              <ReplayOutlined />
            </IconButton>
          </Tooltip>
        ) : drafts.activeCount > 1 ? (
          <Tooltip title={t("subscriptions.remove_plan")}>
            <IconButton
              color="error"
              aria-label={t("subscriptions.remove_plan")}
              loading={drafts.removingKey === row.key}
              onClick={() => void drafts.removeRow(row.key)}
            >
              <DeleteOutlined />
            </IconButton>
          </Tooltip>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
