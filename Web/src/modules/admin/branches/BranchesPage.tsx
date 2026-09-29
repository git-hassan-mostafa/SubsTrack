import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Branch } from "@shared/core/types";
import type { BranchStatusFilter } from "@shared/modules/admin/branches/utils/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { StatusChip } from "@/shared/components/StatusChip";
import { DataTable } from "@/shared/table/DataTable";
import type { TableAction } from "@/shared/table/tableAction";
import { readAllBranches, useBranchesTable } from "@/state/branchesTable";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";
import { BranchFormDialog } from "./BranchFormDialog";

const STATUS_FILTERS: { value: BranchStatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "web.filter_all" },
  { value: "active", labelKey: "common.active" },
  { value: "inactive", labelKey: "common.inactive" },
];

// The reference list page: every later web table copies this shape.
export function BranchesPage() {
  const { t } = useTranslation();
  const rows = useBranchesTable((s) => s.rows);
  const total = useBranchesTable((s) => s.total);
  const loaded = useBranchesTable((s) => s.loaded);
  const loading = useBranchesTable((s) => s.loading);
  const tableError = useBranchesTable((s) => s.error);
  const query = useBranchesTable((s) => s.query);
  const load = useBranchesTable((s) => s.load);
  const setPage = useBranchesTable((s) => s.setPage);
  const setSearch = useBranchesTable((s) => s.setSearch);
  const setFilters = useBranchesTable((s) => s.setFilters);
  const clearFilters = useBranchesTable((s) => s.clearFilters);
  const clearTableError = useBranchesTable((s) => s.clearError);
  const writeError = useBranchSlice((s) => s.error);
  const clearWriteError = useBranchSlice((s) => s.clearError);
  const deleteBranch = useBranchSlice((s) => s.deleteBranch);
  const deactivateBranch = useBranchSlice((s) => s.deactivateBranch);
  const bulkDeleteBranches = useBranchSlice((s) => s.bulkDeleteBranches);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const history = useRecordHistoryAction("branches");
  const [form, setForm] = useState<{ branch: Branch | null } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => void load();

  const confirmDeactivate = (branch: Branch) =>
    confirm({
      title: t("branches.deactivate_title"),
      message: t("branches.deactivate_message", { name: branch.name }),
      destructive: true,
      onConfirm: async () => {
        if (await deactivateBranch(branch.id)) reload();
      },
    });

  const confirmDelete = (branches: Branch[]) => {
    const single = branches.length === 1 ? branches[0] : null;
    return confirm({
      title: single
        ? t("branches.delete_title")
        : t("branches.bulk_delete_title", { count: branches.length }),
      message: single
        ? t("branches.delete_message", { name: single.name })
        : t("branches.bulk_delete_message", { count: branches.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? (await deleteBranch(single.id)) !== null
          : await bulkDeleteBranches(branches.map((b) => b.id));
        if (done) reload();
      },
    });
  };

  const reactivate = async (branch: Branch) => {
    if (await reactivateBranch(branch.id)) reload();
  };

  const statusAction = (branch: Branch): TableAction =>
    branch.active
      ? {
          key: "deactivate",
          group: "status",
          label: t("branches.deactivate"),
          icon: PauseCircleOutlined,
          destructive: true,
          onClick: () => void confirmDeactivate(branch),
        }
      : {
          key: "reactivate",
          group: "status",
          label: t("branches.reactivate"),
          icon: PlayCircleOutlined,
          onClick: () => void reactivate(branch),
        };

  const editAction = (branch: Branch): TableAction => ({
    key: "edit",
    group: "manage",
    label: t("common.edit"),
    icon: EditOutlined,
    onClick: () => setForm({ branch }),
  });

  const deleteAction = (branches: Branch[]): TableAction => ({
    key: "delete",
    group: "danger",
    label: t("common.delete"),
    icon: DeleteOutlined,
    destructive: true,
    onClick: () => void confirmDelete(branches),
  });

  const rowActions = (branch: Branch): TableAction[] => [
    editAction(branch),
    history.action(branch.id, branch.name),
    statusAction(branch),
    deleteAction([branch]),
  ];

  const bulkActions = (selected: Branch[]): TableAction[] =>
    selected.length === 1
      ? [editAction(selected[0]), statusAction(selected[0]), deleteAction(selected)]
      : [deleteAction(selected)];

  const columns: GridColDef<Branch>[] = [
    {
      field: "name",
      headerName: t("branches.name_label"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Link
          component="button"
          type="button"
          tabIndex={params.tabIndex}
          onClick={() => setForm({ branch: params.row })}
          sx={{ fontWeight: 600, textAlign: "start" }}
        >
          {params.row.name}
        </Link>
      ),
    },
    {
      field: "active",
      headerName: t("web.status"),
      width: 140,
      renderCell: (params) =>
        params.row.active ? (
          <StatusChip label={t("common.active")} tone="emerald" />
        ) : (
          <StatusChip label={t("common.inactive")} tone="gray" />
        ),
    },
  ];

  const statusFilter = (
    <TextField
      select
      size="small"
      label={t("web.status")}
      value={query.filters.status}
      onChange={(event) => setFilters({ status: event.target.value as BranchStatusFilter })}
      sx={{ minWidth: 160 }}
    >
      {STATUS_FILTERS.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {t(option.labelKey)}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Branch>
        label={t("branches.section_title")}
        columns={columns}
        rows={rows}
        total={total}
        loaded={loaded}
        loading={loading}
        page={query.page}
        pageSize={query.pageSize}
        onPageChange={setPage}
        search={{
          value: query.search,
          onSearch: setSearch,
          placeholder: t("web.branches.search"),
        }}
        filters={statusFilter}
        add={{ label: t("web.branches.add"), onClick: () => setForm({ branch: null }) }}
        exportConfig={{ nameKey: "branches.section_title", loadAll: () => readAllBranches(query) }}
        rowLabel={(branch) => branch.name}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("branches.no_branches"), hint: t("web.branches.empty_hint") }}
        filtered={query.search !== "" || query.filters.status !== "all"}
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onRetry={reload}
      />
      {form ? (
        <BranchFormDialog
          branch={form.branch}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
