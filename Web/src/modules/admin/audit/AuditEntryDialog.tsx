import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForward from "@mui/icons-material/ArrowForward";
import type { AuditEntry } from "@shared/core/types";
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
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

function ChangeList({ entry, ctx }: { entry: AuditEntry; ctx: AuditFieldContext }) {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined" component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
      {entry.changes.map((change, index) => (
        <Box
          component="li"
          key={change.field}
          sx={{
            px: 2,
            py: 1.5,
            borderTop: index === 0 ? 0 : 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {formatFieldLabel(change.field, ctx)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textDecoration: "line-through" }}
              aria-label={t("web.audit.before", {
                value: formatField(change.field, change.before, ctx),
              })}
            >
              {formatField(change.field, change.before, ctx)}
            </Typography>
            <ArrowForward fontSize="small" color="disabled" aria-hidden />
            <Typography
              variant="body2"
              sx={{ fontWeight: 600 }}
              aria-label={t("web.audit.after", {
                value: formatField(change.field, change.after, ctx),
              })}
            >
              {formatField(change.field, change.after, ctx)}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Paper>
  );
}
