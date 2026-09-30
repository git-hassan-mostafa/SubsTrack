import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { GridColDef } from "@mui/x-data-grid";
import type { Customer } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { planSummary } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { hasDebtFlag } from "@shared/modules/customer/customers/utils/customerFlags";
import {
  CUSTOMER_TAB_LABEL_KEYS,
  CUSTOMER_TABS,
  type CustomerTab,
} from "@shared/modules/customer/customers/utils/customerTabs";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { openWhatsApp } from "@/shared/lib/openWhatsApp";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import {
  DEFAULT_CUSTOMER_TAB,
  readAllCustomers,
  useCustomersTable,
  type CustomerRow,
} from "@/state/customersTable";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { CustomerPills } from "./CustomerPills";
import { useCustomerHistoryAction } from "./useCustomerHistoryAction";

// Money row actions (pay, collect, write off) arrive with the collect dialog.
export function CustomersPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const rows = useCustomersTable((s) => s.rows);
  const total = useCustomersTable((s) => s.total);
  const counts = useCustomersTable((s) => s.meta);
  const loaded = useCustomersTable((s) => s.loaded);
  const loading = useCustomersTable((s) => s.loading);
  const tableError = useCustomersTable((s) => s.error);
  const query = useCustomersTable((s) => s.query);
  const load = useCustomersTable((s) => s.load);
  const open = useCustomersTable((s) => s.open);
  const setPage = useCustomersTable((s) => s.setPage);
  const setSearch = useCustomersTable((s) => s.setSearch);
  const setFilters = useCustomersTable((s) => s.setFilters);
  const clearFilters = useCustomersTable((s) => s.clearFilters);
  const clearTableError = useCustomersTable((s) => s.clearError);
  const writeError = useCustomerSlice((s) => s.error);
  const clearWriteError = useCustomerSlice((s) => s.clearError);
  const deactivateCustomer = useCustomerSlice((s) => s.deactivateCustomer);
  const reactivateCustomer = useCustomerSlice((s) => s.reactivateCustomer);
  const deleteCustomer = useCustomerSlice((s) => s.deleteCustomer);
  const bulkDeleteCustomers = useCustomerSlice((s) => s.bulkDeleteCustomers);
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const branch = useEffectiveBranchFilter();
  const branchColumn = useBranchColumn<CustomerRow>(t("branches.unassigned"));
  const history = useCustomerHistoryAction();
  const [form, setForm] = useState<{ customer: Customer | null } | null>(null);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const reload = () => void load();

  const confirmToggleActive = (customer: Customer) =>
    confirm({
      title: customer.active ? t("customers.deactivate_title") : t("customers.reactivate_title"),
      message: customer.active
        ? t("customers.deactivate_message", { name: customer.name })
        : t("customers.reactivate_message", { name: customer.name }),
      confirmLabel: customer.active ? t("customers.deactivate") : t("customers.activate"),
      destructive: customer.active,
      onConfirm: async () => {
        const saved = customer.active
          ? await deactivateCustomer(customer)
          : await reactivateCustomer(customer);
        if (saved) reload();
      },
    });

  const confirmDelete = (customers: Customer[]) => {
    const single = customers.length === 1 ? customers[0] : null;
    return confirm({
      title: single
        ? t("customers.delete_title")
        : t("customers.bulk_delete_title", { count: customers.length }),
      message: single
        ? t("customers.delete_message", { name: single.name })
        : t("customers.bulk_delete_message", { count: customers.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? (await deleteCustomer(single)) !== null
          : await bulkDeleteCustomers(customers);
        if (done) reload();
      },
    });
  };

  const editAction = (customer: Customer): TableAction => ({
    key: "edit",
    group: "manage",
    label: t("common.edit"),
    icon: EditOutlined,
    onClick: () => setForm({ customer }),
  });

  const whatsAppAction = (customer: Customer): TableAction => ({
    key: "whatsapp-chat",
    group: "send",
    label: t("invoice.open_whatsapp_chat"),
    icon: WhatsApp,
    onClick: () => void openWhatsApp(customer.phoneNumber),
  });

  const toggleActiveAction = (customer: Customer): TableAction => ({
    key: "toggle-active",
    group: "status",
    label: customer.active ? t("customers.deactivate") : t("customers.activate"),
    icon: customer.active ? PauseCircleOutlined : PlayCircleOutlined,
    onClick: () => void confirmToggleActive(customer),
  });

  const deleteAction = (customers: Customer[]): TableAction => ({
    key: "delete",
    group: "danger",
    label: t("common.delete"),
    icon: DeleteOutlined,
    destructive: true,
    onClick: () => void confirmDelete(customers),
  });

  const rowActions = ({ customer }: CustomerRow): TableAction[] => [
    editAction(customer),
    history.action(customer),
    ...(whatsAppChatUrl(customer.phoneNumber) ? [whatsAppAction(customer)] : []),
    ...(isAdmin ? [toggleActiveAction(customer), deleteAction([customer])] : []),
  ];

  const bulkActions = (selected: CustomerRow[]): TableAction[] => {
    const customers = selected.map((row) => row.customer);
    if (customers.length > 1) return [deleteAction(customers)];
    return [editAction(customers[0]), toggleActiveAction(customers[0]), deleteAction(customers)];
  };

  const columns: GridColDef<CustomerRow>[] = [
    {
      field: "name",
      headerName: t("customers.name_label"),
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_value, row) => row.customer.name,
      renderCell: (params) => (
        <RowLink
          label={params.row.customer.name}
          tabIndex={params.tabIndex}
          onClick={() => setForm({ customer: params.row.customer })}
        />
      ),
    },
    {
      field: "plan",
      headerName: t("customers.plan_label"),
      flex: 1,
      minWidth: 150,
      valueGetter: (_value, row) => planSummary(row.customer, t),
    },
    {
      field: "phone",
      headerName: t("customers.phone_label"),
      width: 160,
      valueGetter: (_value, row) => row.customer.phoneNumber ?? "",
    },
    ...(branchColumn ? [branchColumn] : []),
    {
      field: "status",
      headerName: t("customers.status_label"),
      flex: 1.2,
      minWidth: 200,
      renderCell: (params) => (
        <CustomerPills customer={params.row.customer} status={params.row.status} />
      ),
    },
    {
      field: "debtUsd",
      headerName: t("customers.debt"),
      width: 140,
      align: "right",
      headerAlign: "right",
      renderCell: (params) =>
        hasDebtFlag(params.row.debtUsd) ? (
          <MoneyText primary={formatMoney(params.row.debtUsd, null, display)} />
        ) : null,
    },
  ];

  const tabLabel = (tab: CustomerTab) => {
    const label = t(CUSTOMER_TAB_LABEL_KEYS[tab]);
    return counts ? t("web.customers.tab_count", { label, count: counts[tab] }) : label;
  };

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <Paper variant="outlined">
        <Tabs
          value={query.filters.tab}
          onChange={(_event, tab: CustomerTab) => setFilters({ tab })}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t("web.customers.groups")}
        >
          {CUSTOMER_TABS.map((tab) => (
            <Tab key={tab} value={tab} label={tabLabel(tab)} />
          ))}
        </Tabs>
      </Paper>
      <DataTable<CustomerRow>
        label={t("customers.title")}
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
          placeholder: t("web.customers.search"),
        }}
        add={{ label: t("web.customers.add"), onClick: () => setForm({ customer: null }) }}
        exportConfig={{
          nameKey: "customers.title",
          loadAll: () => readAllCustomers(query),
          record: (row) => row.customer,
        }}
        rowLabel={(row) => row.customer.name}
        rowActions={rowActions}
        bulkActions={isAdmin ? bulkActions : undefined}
        empty={{ title: t("customers.no_customers"), hint: t("web.customers.empty_hint") }}
        filtered={query.search !== "" || query.filters.tab !== DEFAULT_CUSTOMER_TAB}
        autoRowHeight
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onRetry={reload}
      />
      {form ? (
        <CustomerFormDialog
          customer={form.customer}
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
