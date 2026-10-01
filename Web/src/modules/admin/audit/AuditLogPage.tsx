import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { AuditAction, AuditEntry, AuditTable } from "@shared/core/types";
import { formatDateTimeShort } from "@shared/core/utils/date";
import { useAuditLookups } from "@shared/modules/admin/audit/hooks/useAuditLookups";
import { AUDITED_TABLES } from "@shared/modules/admin/audit/utils/constants";
import {
  AUDIT_ACTIONS,
  hasAuditFilter,
  type AuditFilterChoice,
} from "@shared/modules/admin/audit/utils/filter";
import { actionLabel, tableLabel } from "@shared/modules/admin/audit/utils/format";
import { buildAuditSummary } from "@shared/modules/admin/audit/utils/summary";
import {
  fieldContext,
  type AuditContextBase,
} from "@shared/modules/admin/audit/utils/valueDisplay";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { DateField } from "@/shared/components/DateField";
import { DataTable } from "@/shared/table/DataTable";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllAuditEntries, useAuditTable } from "@/state/auditTable";
import { AuditEntryDialog } from "./AuditEntryDialog";
import { AuditSummaryText } from "./AuditSummaryText";
import { RecordHistoryDialog } from "./RecordHistoryDialog";

// Newest first, read-only; admin-only is enforced by RLS as well as the route.
export function AuditLogPage() {
  const { t } = useTranslation();
  const rows = useAuditTable((s) => s.rows);
  const total = useAuditTable((s) => s.total);
  const loaded = useAuditTable((s) => s.loaded);
  const loading = useAuditTable((s) => s.loading);
  const error = useAuditTable((s) => s.error);
  const query = useAuditTable((s) => s.query);
  const load = useAuditTable((s) => s.load);
  const open = useAuditTable((s) => s.open);
  const setPage = useAuditTable((s) => s.setPage);
  const setFilters = useAuditTable((s) => s.setFilters);
  const clearFilters = useAuditTable((s) => s.clearFilters);
  const clearError = useAuditTable((s) => s.clearError);
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const branch = useEffectiveBranchFilter();
  const branchColumn = useBranchColumn<AuditEntry>(t("web.audit.no_branch"));
  const lookups = useAuditLookups();
  const base = useMemo<AuditContextBase>(() => ({ t, lookups }), [t, lookups]);
  const [opened, setOpened] = useState<AuditEntry | null>(null);
  const [recordOf, setRecordOf] = useState<AuditEntry | null>(null);
  const filters = query.filters;

  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const pick = (next: Partial<AuditFilterChoice>) => setFilters(next);

  const rowActions = (entry: AuditEntry): TableAction[] => [
    {
      key: "details",
      group: "open",
      label: t("web.audit.details"),
      icon: VisibilityOutlined,
      onClick: () => setOpened(entry),
    },
    {
      key: "history",
      group: "history",
      label: t("web.audit.record_history"),
      icon: HistoryOutlined,
      onClick: () => setRecordOf(entry),
    },
  ];

  const columns: GridColDef<AuditEntry>[] = [
    {
      field: "occurredAt",
      headerName: t("audit.occurred_at"),
      width: 170,
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
      minWidth: 320,
      renderCell: (params) => (
        <Box sx={{ whiteSpace: "normal", lineHeight: 1.5 }}>
          <AuditSummaryText
            parts={buildAuditSummary(params.row, fieldContext(base, params.row))}
          />
        </Box>
      ),
    },
    {
      field: "table",
      headerName: t("audit.filter_by_table"),
      width: 150,
      valueGetter: (_value, row) => tableLabel(t, row.table),
    },
    ...(branchColumn ? [branchColumn] : []),
  ];

  return (
    <Stack spacing={2}>
      <DataTable<AuditEntry>
        label={t("audit.title")}
        columns={columns}
        rows={rows}
        total={total}
        loaded={loaded}
        loading={loading}
        page={query.page}
        pageSize={query.pageSize}
        onPageChange={setPage}
        filters={
          <>
            <FilterSelect<AuditTable | null>
              label={t("audit.filter_by_table")}
              anyLabel={t("audit.all_tables")}
              value={filters.table}
              onChange={(table) => pick({ table })}
              options={AUDITED_TABLES.map((table) => ({ value: table, label: tableLabel(t, table) }))}
            />
            <FilterSelect<AuditAction | null>
              label={t("audit.filter_by_action")}
              anyLabel={t("audit.all_actions")}
              value={filters.action}
              onChange={(action) => pick({ action })}
              options={AUDIT_ACTIONS.map((action) => ({ value: action, label: actionLabel(t, action) }))}
              minWidth={140}
            />
            <FilterSelect<string | null>
              label={t("audit.filter_by_actor")}
              anyLabel={t("audit.all_actors")}
              value={filters.actor}
              onChange={(actor) => pick({ actor })}
              options={users.map((user) => ({ value: user.id, label: user.fullName }))}
            />
            <Box sx={{ width: 170 }}>
              <DateField
                label={t("audit.date_from")}
                value={filters.from ?? ""}
                onChange={(value) => pick({ from: value || null })}
                maxDate={filters.to ?? undefined}
                size="small"
                clearable
              />
            </Box>
            <Box sx={{ width: 170 }}>
              <DateField
                label={t("audit.date_to")}
                value={filters.to ?? ""}
                onChange={(value) => pick({ to: value || null })}
                minDate={filters.from ?? undefined}
                size="small"
                clearable
              />
            </Box>
          </>
        }
        exportConfig={{ nameKey: "audit.title", loadAll: () => readAllAuditEntries(query) }}
        rowLabel={(entry) => formatDateTimeShort(entry.occurredAt)}
        rowActions={rowActions}
        empty={{ title: t("audit.empty_title"), hint: t("audit.empty_desc") }}
        filtered={hasAuditFilter(filters)}
        onClearFilters={clearFilters}
        autoRowHeight
        error={error}
        onDismissError={clearError}
        onReload={() => void load()}
      />
      {opened ? (
        <AuditEntryDialog entry={opened} base={base} onClose={() => setOpened(null)} />
      ) : null}
      {recordOf ? (
        <RecordHistoryDialog
          table={recordOf.table}
          recordId={recordOf.recordId}
          name={recordOf.subject}
          onClose={() => setRecordOf(null)}
        />
      ) : null}
    </Stack>
  );
}
