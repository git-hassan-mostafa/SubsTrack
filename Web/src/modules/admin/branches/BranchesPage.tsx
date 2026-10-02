import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Branch } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { readAllBranches, useBranchesTable } from "@/state/branchesTable";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";
import { BranchFormDialog } from "./BranchFormDialog";

// The reference list page: every later web table copies this shape.
export function BranchesPage() {
  const { t } = useTranslation();
  const paged = usePagedTable(useBranchesTable);
  const query = paged.query;
  const patchRow = paged.patchRow;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const writeError = useBranchSlice((s) => s.error);
  const clearWriteError = useBranchSlice((s) => s.clearError);
  const deleteBranch = useBranchSlice((s) => s.deleteBranch);
  const deactivateBranch = useBranchSlice((s) => s.deactivateBranch);
  const bulkDeleteBranches = useBranchSlice((s) => s.bulkDeleteBranches);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const history = useRecordHistoryAction("branches");
  const [form, setForm] = useState<{ branch: Branch | null } | null>(null);

  const confirmDeactivate = (branch: Branch) =>
    confirm({
      title: t("branches.deactivate_title"),
      message: t("branches.deactivate_message", { name: branch.name }),
      destructive: true,
      onConfirm: async () => {
        const updated = await deactivateBranch(branch.id);
        if (updated) patchRow(updated);
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
    const updated = await reactivateBranch(branch.id);
    if (updated) patchRow(updated);
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
        <RowLink
          label={params.row.name}
          tabIndex={params.tabIndex}
          onClick={() => setForm({ branch: params.row })}
        />
      ),
    },
    activeStatusColumn<Branch>(t),
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Branch>
        label={t("branches.section_title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
          placeholder: t("web.branches.search"),
        }}
        filters={
          <ActiveFilterSelect
            value={query.filters.status}
            onChange={(status) => setFilters({ status })}
          />
        }
        add={{ label: t("web.branches.add"), onClick: () => setForm({ branch: null }) }}
        exportConfig={{ nameKey: "branches.section_title", loadAll: () => readAllBranches(query) }}
        rowLabel={(branch) => branch.name}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("branches.no_branches"), hint: t("web.branches.empty_hint") }}
        filtered={query.search !== "" || query.filters.status !== "all"}
      />
      {form ? (
        <BranchFormDialog
          branch={form.branch}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.branch) patchRow(saved);
            else reload();
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
