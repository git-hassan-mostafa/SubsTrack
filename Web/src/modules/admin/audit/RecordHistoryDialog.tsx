import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import type { AuditEntry, AuditTable } from "@shared/core/types";
import { formatDateTimeShort } from "@shared/core/utils/date";
import { useRecordHistory } from "@shared/modules/admin/audit/hooks/useRecordHistory";
import { useAuditLookups } from "@shared/modules/admin/audit/hooks/useAuditLookups";
import { buildAuditSummary } from "@shared/modules/admin/audit/utils/summary";
import {
  fieldContext,
  type AuditContextBase,
} from "@shared/modules/admin/audit/utils/valueDisplay";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { AuditEntryDialog } from "./AuditEntryDialog";
import { AuditSummaryText } from "./AuditSummaryText";

interface RecordHistoryDialogProps {
  table: AuditTable;
  recordId: string;
  name?: string | null;
  onClose: () => void;
}

// Staff get no audit rows (RLS), so they read "admins only", not "never changed".
export function RecordHistoryDialog({ table, recordId, name, onClose }: RecordHistoryDialogProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const titleId = useId();

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {t("audit.record_history_title")}
        {name ? (
          <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
            {name}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent dividers>
        {isAdmin ? (
          <HistoryEntries table={table} recordId={recordId} />
        ) : (
          <EmptyState title={t("audit.admin_only_title")} hint={t("audit.admin_only_desc")} />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

function HistoryEntries({ table, recordId }: { table: AuditTable; recordId: string }) {
  const { t } = useTranslation();
  const targets = useMemo(() => [{ table, recordId }], [table, recordId]);
  const timeline = useRecordHistory(targets);
  const lookups = useAuditLookups();
  const base = useMemo<AuditContextBase>(() => ({ t, lookups }), [t, lookups]);
  const [opened, setOpened] = useState<AuditEntry | null>(null);

  if (timeline.loading) {
    return (
      <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress aria-label={t("web.loading")} />
      </Box>
    );
  }
  if (timeline.error) return <ErrorBanner message={timeline.error} />;
  if (timeline.entries.length === 0) {
    return <EmptyState title={t("audit.record_empty_title")} hint={t("audit.record_empty_desc")} />;
  }
  return (
    <>
      <List disablePadding>
        {timeline.entries.map((entry) => (
          <ListItem key={entry.id} divider disablePadding>
            <ListItemButton onClick={() => setOpened(entry)}>
              <ListItemText
                primary={
                  <AuditSummaryText
                    parts={buildAuditSummary(entry, fieldContext(base, entry), {
                      showSubject: false,
                    })}
                  />
                }
                secondary={formatDateTimeShort(entry.occurredAt)}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      {opened ? (
        <AuditEntryDialog entry={opened} base={base} onClose={() => setOpened(null)} />
      ) : null}
    </>
  );
}
