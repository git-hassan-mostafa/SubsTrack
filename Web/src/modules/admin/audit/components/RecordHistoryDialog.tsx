import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { AuditEntry, AuditRecordTarget, AuditTable, Customer } from "@shared/core/types";
import { formatDateTimeShort } from "@shared/core/utils/date";
import {
  useCustomerHistory,
  useRecordHistory,
  type RecordHistoryState,
} from "@shared/modules/admin/audit/hooks/useRecordHistory";
import { useAuditLookups } from "@shared/modules/admin/audit/hooks/useAuditLookups";
import { useBillHistory } from "@shared/modules/ledger/hooks/useBillHistory";
import { buildAuditSummary } from "@shared/modules/admin/audit/utils/summary";
import {
  fieldContext,
  type AuditContextBase,
} from "@shared/modules/admin/audit/utils/valueDisplay";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { AuditEntryDialog } from "./AuditEntryDialog";
import { AuditSummaryText } from "./AuditSummaryText";

interface RecordHistoryDialogProps {
  table: AuditTable;
  recordId: string;
  name?: string | null;
  onClose: () => void;
}

export function RecordHistoryDialog({ table, recordId, name, onClose }: RecordHistoryDialogProps) {
  const { t } = useTranslation();
  return (
    <HistoryDialogFrame title={t("audit.record_history_title")} name={name} onClose={onClose}>
      <RecordTimeline table={table} recordId={recordId} />
    </HistoryDialogFrame>
  );
}

// The customer row, every line it held, and the month payments / skips on them.
export function CustomerHistoryDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <HistoryDialogFrame title={t("audit.customer_history_title")} name={customer.name} onClose={onClose}>
      <CustomerTimeline customerId={customer.id} />
    </HistoryDialogFrame>
  );
}

interface BillHistoryDialogProps {
  chargeId: string | null;
  targets?: AuditRecordTarget[];
  name?: string | null;
  onClose: () => void;
}

// A record's trail WITH its bill and the cash that settled it.
export function BillHistoryDialog({ chargeId, targets, name, onClose }: BillHistoryDialogProps) {
  const { t } = useTranslation();
  return (
    <HistoryDialogFrame title={t("audit.record_history_title")} name={name} onClose={onClose}>
      <BillTimeline chargeId={chargeId} targets={targets} />
    </HistoryDialogFrame>
  );
}

interface HistoryDialogFrameProps {
  title: string;
  name?: string | null;
  onClose: () => void;
  children: ReactNode;
}

// Staff get no audit rows (RLS), so they read "admins only", not "never changed".
function HistoryDialogFrame({ title, name, onClose, children }: HistoryDialogFrameProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const titleId = useId();

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {title}
        {name ? (
          <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
            {name}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent dividers>
        {isAdmin ? (
          children
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

function RecordTimeline({ table, recordId }: { table: AuditTable; recordId: string }) {
  const targets = useMemo(() => [{ table, recordId }], [table, recordId]);
  return <HistoryEntries timeline={useRecordHistory(targets)} />;
}

function BillTimeline({ chargeId, targets }: { chargeId: string | null; targets?: AuditRecordTarget[] }) {
  return <HistoryEntries timeline={useBillHistory(chargeId, targets)} />;
}

function CustomerTimeline({ customerId }: { customerId: string }) {
  return <HistoryEntries timeline={useCustomerHistory(customerId)} />;
}

function HistoryEntries({ timeline }: { timeline: RecordHistoryState }) {
  const { t } = useTranslation();
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
  const columns: GridColDef<AuditEntry>[] = [
    {
      field: "occurredAt",
      headerName: t("audit.occurred_at"),
      width: 160,
      renderCell: (params) => (
        <RowLink
          label={formatDateTimeShort(params.row.occurredAt)}
          tabIndex={params.tabIndex}
          onClick={() => setOpened(params.row)}
        />
      ),
    },
    {
      field: "summary",
      headerName: t("web.audit.change"),
      flex: 1,
      minWidth: 280,
      renderCell: (params) => (
        <Box sx={{ whiteSpace: "normal", lineHeight: 1.5 }}>
          <AuditSummaryText
            parts={buildAuditSummary(params.row, fieldContext(base, params.row), {
              showSubject: false,
            })}
          />
        </Box>
      ),
    },
    {
      field: "actorUsername",
      headerName: t("audit.filter_by_actor"),
      width: 140,
      valueGetter: (_value, row) => row.actorUsername ?? t("audit.unknown_actor"),
    },
  ];

  return (
    <>
      <LocalTable<AuditEntry>
        label={t("audit.record_history_title")}
        columns={columns}
        rows={timeline.entries}
        autoRowHeight
      />
      {opened ? (
        <AuditEntryDialog entry={opened} base={base} onClose={() => setOpened(null)} />
      ) : null}
    </>
  );
}
