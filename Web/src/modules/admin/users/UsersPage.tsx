import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { AppUser, UserRole } from "@shared/core/types";
import type { UserRoleFilter } from "@shared/modules/admin/users/utils/types";
import { canEditUser } from "@shared/modules/admin/users/utils/userPermissions";
import {
  splitManageable,
  userRowActions,
  userSelectionActions,
  type UserActionKey,
} from "@shared/modules/admin/users/utils/userMenu";
import { roleLabelKey } from "@shared/modules/admin/users/utils/userRules";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { confirm } from "@shared/shared/lib/confirm";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import type { ChipTone } from "@/shared/components/chipTones";
import { StatusChip } from "@/shared/components/StatusChip";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllUsers, useUsersTable } from "@/state/usersTable";
import { useHistoryDoor } from "@/modules/admin/audit/useHistoryDoor";
import { UserFormDialog } from "./UserFormDialog";
import { USER_ACTION_ICONS } from "./userActionIcons";

const ROLE_TONES: Record<UserRole, ChipTone> = {
  admin: "indigo",
  user: "teal",
  superadmin: "violet",
};

const ROLE_FILTERS: { value: UserRoleFilter; labelKey: string }[] = [
  { value: "all", labelKey: "web.users.role_all" },
  { value: "admin", labelKey: "web.users.role_admins" },
  { value: "user", labelKey: "web.users.role_staff" },
];

// A row outside the viewer's branch is readable but never writable (RLS).
export function UsersPage() {
  const { t } = useTranslation();
  const { user: viewer } = useAuth();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(useUsersTable, branch);
  const query = paged.query;
  const patchRow = paged.patchRow;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const writeError = useUserSlice((s) => s.error);
  const clearWriteError = useUserSlice((s) => s.clearError);
  const deactivateUser = useUserSlice((s) => s.deactivateUser);
  const activateUser = useUserSlice((s) => s.activateUser);
  const deleteUser = useUserSlice((s) => s.deleteUser);
  const bulkDeleteUsers = useUserSlice((s) => s.bulkDeleteUsers);
  const branchColumn = useBranchColumn<AppUser>(t("branches.tenant_wide_admin"));
  const history = useHistoryDoor("users");
  const [form, setForm] = useState<{ user: AppUser | null } | null>(null);

  const confirmToggle = (target: AppUser) =>
    confirm({
      title: target.active ? t("users.deactivate") : t("users.activate"),
      message: target.active
        ? t("customers.deactivate_message", { name: target.fullName })
        : t("customers.reactivate_message", { name: target.fullName }),
      destructive: target.active,
      onConfirm: async () => {
        if (!viewer) return;
        const toggle = target.active ? deactivateUser : activateUser;
        const updated = await toggle(target.id, viewer.id, viewer.role, target.role);
        if (updated) patchRow(updated);
      },
    });

  const confirmDelete = (selected: AppUser[]) => {
    const { manageable, skipped } = viewer ? splitManageable(viewer, selected) : { manageable: [], skipped: 0 };
    const single = manageable.length === 1 && skipped === 0 ? manageable[0] : null;
    return confirm({
      title: single
        ? t("users.delete_title")
        : t("users.bulk_delete_title", { count: manageable.length }),
      message: single
        ? t("users.delete_message", { name: single.fullName })
        : t("users.bulk_delete_message", { count: manageable.length }) +
          (skipped > 0 ? "\n\n" + t("users.bulk_delete_skipped", { count: skipped }) : ""),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        if (!viewer) return;
        const done = single
          ? (await deleteUser(single.id, viewer.id, viewer.role, single.role)) !== null
          : await bulkDeleteUsers(
              manageable.map((u) => ({ id: u.id, role: u.role })),
              viewer.id,
              viewer.role,
            );
        if (done) reload();
      },
    });
  };

  const runFor = (target: AppUser): Record<UserActionKey, () => void> => ({
    edit: () => setForm({ user: target }),
    history: () => history.open(target.id, target.fullName),
    deactivate: () => void confirmToggle(target),
    reactivate: () => void confirmToggle(target),
    delete: () => void confirmDelete([target]),
  });

  const rowActions = (target: AppUser): TableAction[] =>
    viewer
      ? toTableActions(userRowActions(viewer, target), t, { icons: USER_ACTION_ICONS, run: runFor(target) })
      : [];

  const bulkActions = (selected: AppUser[]): TableAction[] =>
    viewer
      ? toTableActions(userSelectionActions(viewer, selected), t, {
          icons: USER_ACTION_ICONS,
          run: {
            ...(selected.length === 1 ? runFor(selected[0]) : {}),
            delete: () => void confirmDelete(selected),
          },
        })
      : [];

  const columns: GridColDef<AppUser>[] = [
    {
      field: "fullName",
      headerName: t("web.users.name"),
      flex: 1,
      minWidth: 180,
      renderCell: (params) =>
        viewer && canEditUser(viewer, params.row) ? (
          <RowLink
            label={params.row.fullName}
            tabIndex={params.tabIndex}
            onClick={() => setForm({ user: params.row })}
          />
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {params.row.fullName}
          </Typography>
        ),
    },
    {
      field: "username",
      headerName: t("users.username_label"),
      flex: 0.8,
      minWidth: 140,
      valueGetter: (_value, row) => `@${row.username}`,
    },
    {
      field: "phoneNumber",
      headerName: t("web.users.phone"),
      width: 160,
      valueGetter: (_value, row) => row.phoneNumber ?? "",
    },
    ...(branchColumn ? [branchColumn] : []),
    {
      field: "role",
      headerName: t("users.role_label"),
      width: 140,
      renderCell: (params) => (
        <StatusChip label={t(roleLabelKey(params.row.role))} tone={ROLE_TONES[params.row.role]} />
      ),
    },
    activeStatusColumn<AppUser>(t),
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<AppUser>
        label={t("users.title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
          placeholder: t("web.users.search"),
        }}
        filters={
          <>
            <FilterSelect<UserRoleFilter>
              label={t("users.role_label")}
              value={query.filters.role}
              onChange={(role) => setFilters({ role })}
              options={ROLE_FILTERS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            />
            <ActiveFilterSelect
              value={query.filters.status}
              onChange={(status) => setFilters({ status })}
            />
          </>
        }
        add={{ label: t("web.users.add"), onClick: () => setForm({ user: null }) }}
        exportConfig={{ nameKey: "users.title", loadAll: () => readAllUsers(query) }}
        rowLabel={(target) => target.fullName}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("users.no_staff"), hint: t("web.users.empty_hint") }}
        filtered={
          query.search !== "" || query.filters.status !== "all" || query.filters.role !== "all"
        }
      />
      {form ? (
        <UserFormDialog
          user={form.user}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.user) patchRow(saved);
            else reload();
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
