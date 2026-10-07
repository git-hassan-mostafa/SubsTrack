import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { GridColDef } from "@mui/x-data-grid";
import type { Branch } from "@shared/core/types";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { useCatalogRowActions } from "@/shared/table/useCatalogRowActions";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { readAllBranches, useBranchesTable } from "@/state/branchesTable";
import { useHistoryDoor } from "@/modules/admin/audit/hooks/useHistoryDoor";
import { BranchFormDialog } from "../components/BranchFormDialog";

// The reference list page: every later web table copies this shape.
export function BranchesPage() {
  const { t } = useTranslation();
  const paged = usePagedTable(useBranchesTable);
  const query = paged.query;
  const patchRow = paged.patchRow;
  const addRow = paged.addRow;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const writeError = useBranchSlice((s) => s.error);
  const clearWriteError = useBranchSlice((s) => s.clearError);
  const deleteBranch = useBranchSlice((s) => s.deleteBranch);
  const deactivateBranch = useBranchSlice((s) => s.deactivateBranch);
  const bulkDeleteBranches = useBranchSlice((s) => s.bulkDeleteBranches);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const history = useHistoryDoor("branches");
  const [form, setForm] = useState<{ branch: Branch | null } | null>(null);

  const { rowActions, bulkActions } = useCatalogRowActions<Branch>({
    kind: "branch",
    textKeys: "branches",
    nameValues: (branch) => ({ name: branch.name }),
    remove: deleteBranch,
    removeMany: bulkDeleteBranches,
    deactivate: deactivateBranch,
    reactivate: reactivateBranch,
    patchRow,
    reload,
    doors: (branch) => ({
      edit: () => setForm({ branch }),
      history: () => history.open(branch.id, branch.name),
    }),
  });

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
        viewKey="branches"
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
            else addRow(saved);
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
