import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { AuditChange, AuditEntry } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import {
  actionLabel,
  changedFieldsLabel,
  formatField,
  formatFieldLabel,
  shownSnapshotFields,
  subjectLabel,
  tableLabel,
} from "@shared/modules/admin/audit/utils/format";
import { buildAuditSummary } from "@shared/modules/admin/audit/utils/summary";
import {
  fieldContext,
  type AuditContextBase,
  type AuditFieldContext,
} from "@shared/modules/admin/audit/utils/valueDisplay";
import { InfoRows } from "@/shared/components/InfoRows";
import { LocalTable } from "@/shared/table/LocalTable";
import { AuditSummaryText } from "./AuditSummaryText";

interface AuditEntryDialogProps {
  entry: AuditEntry;
  base: AuditContextBase;
  onClose: () => void;
}

// One entry in full: the sentence, who and when, then every field that moved.
export function AuditEntryDialog({ entry, base, onClose }: AuditEntryDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const ctx = useMemo(() => fieldContext(base, entry), [base, entry]);
  const snapshot = shownSnapshotFields(entry);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {`${actionLabel(t, entry.action)} · ${tableLabel(t, entry.table)}`}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography>
            <AuditSummaryText parts={buildAuditSummary(entry, ctx)} />
          </Typography>
          <InfoRows
            rows={[
              { label: subjectLabel(t, entry.table), value: entry.subject },
              {
                label: t("audit.filter_by_actor"),
                value: entry.actorUsername ?? t("audit.unknown_actor"),
              },
              { label: t("audit.occurred_at"), value: formatDateTime(entry.occurredAt) },
              { label: t("audit.changed_fields"), value: changedFieldsLabel(entry, ctx) },
            ]}
          />
          {entry.changes.length > 0 ? <ChangeList entry={entry} ctx={ctx} /> : null}
          {snapshot.length > 0 ? (
            <InfoRows
              rows={snapshot.map(([field, value]) => ({
                label: formatFieldLabel(field, ctx),
                value: formatField(field, value, ctx),
              }))}
            />
          ) : null}
          {entry.changes.length === 0 && snapshot.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
              {t("audit.no_fields")}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

type ChangeRow = AuditChange & { id: string };

function ChangeList({ entry, ctx }: { entry: AuditEntry; ctx: AuditFieldContext }) {
  const { t } = useTranslation();
  const rows: ChangeRow[] = entry.changes.map((change) => ({ ...change, id: change.field }));
  const columns: GridColDef<ChangeRow>[] = [
    {
      field: "field",
      headerName: t("web.audit.field_column"),
      width: 180,
      valueGetter: (_value, row) => formatFieldLabel(row.field, ctx),
    },
    {
      field: "before",
      headerName: t("web.audit.before_column"),
      flex: 1,
      minWidth: 140,
      renderCell: (params) => (
        <Box component="span" sx={{ color: "text.secondary", textDecoration: "line-through", whiteSpace: "normal" }}>
          {formatField(params.row.field, params.row.before, ctx)}
        </Box>
      ),
    },
    {
      field: "after",
      headerName: t("web.audit.after_column"),
      flex: 1,
      minWidth: 140,
      renderCell: (params) => (
        <Box component="span" sx={{ fontWeight: 600, whiteSpace: "normal" }}>
          {formatField(params.row.field, params.row.after, ctx)}
        </Box>
      ),
    },
  ];
  return <LocalTable<ChangeRow> label={t("audit.changed_fields")} columns={columns} rows={rows} autoRowHeight />;
}
