import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Stack from "@mui/material/Stack";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { GridColDef } from "@mui/x-data-grid";
import type { Collection, Customer } from "@shared/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { planSummary } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { useQuickPay } from "@shared/modules/customer/customers/hooks/useQuickPay";
import { hasAnythingOwed, hasDebtFlag } from "@shared/modules/customer/customers/utils/customerFlags";
import { hasCustomerFilters } from "@shared/modules/customer/customers/utils/customerFilters";
import {
  canQuickPay,
  fixedMonthItems,
  isMultiPlan,
  type QuickPayTarget,
} from "@shared/modules/customer/customers/utils/quickPay";
import { useLoadOwed } from "@shared/modules/ledger/hooks/useLoadOwed";
import { useWriteOffActions } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { openWhatsApp } from "@/shared/lib/openWhatsApp";
import { useSendCollectionReceipt } from "@/modules/invoicing/useSendCollectionReceipt";
import { useCollectDialog } from "@/modules/ledger/collect/useCollectDialog";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import {
  readAllCustomers,
  useCustomersTable,
  type CustomerRow,
} from "@/state/customersTable";
import { CustomerFiltersBar } from "./CustomerFiltersBar";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { CustomerPills } from "./CustomerPills";
import { useCustomerAdminActions } from "./useCustomerAdminActions";
import { useCustomerHistoryAction } from "./useCustomerHistoryAction";

// Every money action re-reads the page: a payment can move a customer out of a filter.
export function CustomersPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const rows = useCustomersTable((s) => s.rows);
  const total = useCustomersTable((s) => s.total);
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
  const adminActions = useCustomerAdminActions();
  const ledgerError = useLedgerSlice((s) => s.error);
  const clearLedgerError = useLedgerSlice((s) => s.clearError);
  const loadOwed = useLoadOwed();
  const { writeOffAll } = useWriteOffActions();
  const sendReceipt = useSendCollectionReceipt();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const branch = useEffectiveBranchFilter();
  const branchColumn = useBranchColumn<CustomerRow>(t("branches.unassigned"));
  const history = useCustomerHistoryAction();
  const [form, setForm] = useState<{ customer: Customer | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingOwedFor, setLoadingOwedFor] = useState<string | null>(null);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const reload = () => void load();

  const announcePaid = (collections: Collection[]) => {
    if (collections.length === 0) return;
    const customerIds = new Set(collections.map((c) => c.customerId));
    if (customerIds.size > 1) {
      setNotice(t("web.customers.paid_many", { count: customerIds.size }));
      return;
    }
    const name = rows.find((row) => row.id === collections[0].customerId)?.customer.name ?? "";
    const amount = collections
      .map((c) => {
        const currency = snapshotCurrency(c, currencies);
        return formatMoney(c.amount, currency, currency);
      })
      .join(" + ");
    setNotice(t("web.customers.paid_one", { amount, name }));
  };

  const afterPayment = (collections: Collection[]) => {
    announcePaid(collections);
    reload();
  };

  const collect = useCollectDialog({ onCollected: afterPayment });

  const quickPay = useQuickPay({
    onPaid: afterPayment,
    onTypeOne: (customer, item) => collect.openOne(customer.name, item),
    onTypeMany: (customer) => void navigate(`/customers/${customer.id}?quickPay=1`),
    sendReceipt,
    onNotice: setNotice,
  });

  const targetOf = (row: CustomerRow): QuickPayTarget => ({ customer: row.customer, status: row.status });

  const readOwed = (customer: Customer) => {
    setNotice(null);
    setLoadingOwedFor(customer.id);
    return loadOwed(customer).finally(() => setLoadingOwedFor(null));
  };

  const collectOwed = async (customer: Customer) => {
    const owed = await readOwed(customer);
    if (!owed) return;
    if (owed.length === 0) setNotice(t("ledger.nothing_owed"));
    else collect.open(customer.id, customer.name, owed);
  };

  const writeOffOwed = async (customer: Customer) => {
    const owed = await readOwed(customer);
    if (!owed) return;
    const billed = owed.filter((item) => !!item.chargeId);
    if (billed.length === 0) {
      setNotice(t("ledger.nothing_to_write_off"));
      return;
    }
    if (await writeOffAll(customer.name, billed)) reload();
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

  const toggleActiveAction = (customer: Customer) => adminActions.toggleActive(customer, reload);

  const deleteAction = (customers: Customer[]) => adminActions.remove(customers, reload);

  const quickPayAction = (row: CustomerRow, label: string): TableAction => ({
    key: "quick-pay",
    group: "money",
    label,
    icon: BoltOutlined,
    disabled: quickPay.bulkBusy,
    onClick: () => void quickPay.quickPay(targetOf(row)),
  });

  const moneyActions = (row: CustomerRow): TableAction[] => {
    const { customer, status } = row;
    const actions: TableAction[] = [];
    if (canQuickPay(customer, status)) {
      actions.push(
        quickPayAction(
          row,
          isMultiPlan(customer) ? t("payments.quick_pay.pay_unpaid_plans") : t("payments.quick_pay.menu_label"),
        ),
      );
      if (fixedMonthItems(customer, status, currencies).length > 0) {
        const sendable = whatsAppChatUrl(customer.phoneNumber) !== null;
        actions.push({
          key: "quick-pay-whatsapp",
          group: "money",
          label: t("invoice.pay_and_send_whatsapp"),
          icon: WhatsApp,
          disabled: !sendable,
          caption: sendable ? undefined : t("invoice.no_phone"),
          onClick: () => void quickPay.quickPay(targetOf(row), true),
        });
      }
    }
    if (hasAnythingOwed(status, row.debtUsd)) {
      actions.push({
        key: "collect",
        group: "money",
        label: t("ledger.collect_money"),
        icon: PaymentsOutlined,
        onClick: () => void collectOwed(customer),
      });
      actions.push({
        key: "write-off-all",
        group: "danger",
        label: t("ledger.write_off_all"),
        caption: t("ledger.write_off_all_caption"),
        icon: RemoveCircleOutlineOutlined,
        destructive: true,
        onClick: () => void writeOffOwed(customer),
      });
    }
    return actions;
  };

  const customerActions = (customer: Customer): TableAction[] => [
    editAction(customer),
    history.action(customer),
    ...(whatsAppChatUrl(customer.phoneNumber) ? [whatsAppAction(customer)] : []),
    ...(isAdmin ? [toggleActiveAction(customer), deleteAction([customer])] : []),
  ];

  const rowActions = (row: CustomerRow): TableAction[] => [
    ...moneyActions(row),
    ...customerActions(row.customer),
  ];

  const bulkActions = (selected: CustomerRow[]): TableAction[] => {
    const customers = selected.map((row) => row.customer);
    const adminOnly = (actions: TableAction[]) => (isAdmin ? actions : []);
    if (customers.length > 1) {
      return [
        {
          key: "quick-pay",
          group: "money",
          label: t("payments.quick_pay.menu_label"),
          icon: BoltOutlined,
          disabled: quickPay.bulkBusy,
          onClick: () => void quickPay.bulkQuickPay(selected.map(targetOf)),
        },
        ...adminOnly([deleteAction(customers)]),
      ];
    }
    return [
      editAction(customers[0]),
      quickPayAction(selected[0], t("payments.quick_pay.menu_label")),
      ...adminOnly([toggleActiveAction(customers[0]), deleteAction(customers)]),
    ];
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
          href={`/customers/${params.row.id}`}
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

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <ErrorBanner message={collect.dialog ? null : ledgerError} onDismiss={clearLedgerError} />
      <ErrorBanner message={notice} onDismiss={() => setNotice(null)} severity="info" />
      <CustomerFiltersBar value={query.filters} onChange={setFilters} onClear={clearFilters} />
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
        rowBusy={(row) => quickPay.busyCustomerId === row.id || loadingOwedFor === row.id}
        bulkActions={bulkActions}
        empty={{ title: t("customers.no_customers"), hint: t("web.customers.empty_hint") }}
        filtered={query.search !== "" || hasCustomerFilters(query.filters)}
        autoRowHeight
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onReload={reload}
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
      {collect.dialog}
    </Stack>
  );
}
