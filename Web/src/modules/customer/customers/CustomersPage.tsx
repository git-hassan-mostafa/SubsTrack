import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Stack from "@mui/material/Stack";
import type { GridColDef } from "@mui/x-data-grid";
import type { Collection, Customer } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { planSummary } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { useQuickPay } from "@shared/modules/customer/customers/hooks/useQuickPay";
import { hasDebtFlag } from "@shared/modules/customer/customers/utils/customerFlags";
import {
  customerMenuItems,
  customerSelectionItems,
  type CustomerActionKey,
} from "@shared/modules/customer/customers/utils/customerMenu";
import { hasCustomerFilters } from "@shared/modules/customer/customers/utils/customerFilters";
import type { QuickPayTarget } from "@shared/modules/customer/customers/utils/quickPay";
import { useLoadOwed } from "@shared/modules/ledger/hooks/useLoadOwed";
import { useWriteOffActions } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { openWhatsApp } from "@/shared/lib/openWhatsApp";
import { useSendCollectionReceipt } from "@/modules/invoicing/useSendCollectionReceipt";
import { useCollectDialog } from "@/modules/ledger/collect/useCollectDialog";
import { useDebtDoors } from "@/modules/transaction/debts/useDebtDoors";
import { useSaleDoors } from "@/modules/transaction/sales/useSaleDoors";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { usePagedTable } from "@/shared/table/usePagedTable";
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
import { CUSTOMER_ACTION_ICONS } from "./customerActionIcons";

// A payment re-reads the page through the stale signal; it can change the filter.
export function CustomersPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const writeError = useCustomerSlice((s) => s.error);
  const clearWriteError = useCustomerSlice((s) => s.clearError);
  const adminActions = useCustomerAdminActions();
  const ledgerError = useLedgerSlice((s) => s.error);
  const clearLedgerError = useLedgerSlice((s) => s.clearError);
  const loadOwed = useLoadOwed();
  const { writeOffAll } = useWriteOffActions();
  const sendReceipt = useSendCollectionReceipt();
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();
  const branch = useEffectiveBranchFilter();
  const branchColumn = useBranchColumn<CustomerRow>(t("branches.unassigned"));
  const history = useCustomerHistoryAction();
  const sale = useSaleDoors();
  const debts = useDebtDoors();
  const [form, setForm] = useState<{ customer: Customer | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingOwedFor, setLoadingOwedFor] = useState<string | null>(null);

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

  const collect = useCollectDialog({ onCollected: announcePaid });

  const quickPay = useQuickPay({
    onPaid: announcePaid,
    onTypeOne: (customer, item) => collect.openOne(customer.name, item),
    onTypeMany: (customer) => void navigate(`/customers/${customer.id}?quickPay=1`),
    sendReceipt,
    onNotice: setNotice,
  });

  const paged = usePagedTable(
    useCustomersTable,
    branch,
    quickPay.bulkBusy || quickPay.busyCustomerId !== null,
  );
  const { query, setFilters } = paged;
  const { rows, onClearFilters: clearFilters } = paged.tableProps;

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
    await writeOffAll(customer.name, billed);
  };

  const runFor = (row: CustomerRow): Record<CustomerActionKey, () => void> => {
    const { customer } = row;
    return {
      quick_pay: () => void quickPay.quickPay(targetOf(row)),
      quick_pay_whatsapp: () => void quickPay.quickPay(targetOf(row), true),
      record_sale: () => sale.recordSale(customer),
      add_custom_debt: () => debts.addCustomDebt(customer),
      collect: () => void collectOwed(customer),
      write_off_all: () => void writeOffOwed(customer),
      whatsapp_chat: () => void openWhatsApp(customer.phoneNumber),
      edit: () => setForm({ customer }),
      history: () => history.open(customer),
      deactivate: () => void adminActions.toggleActive(customer),
      reactivate: () => void adminActions.toggleActive(customer),
      delete: () => void adminActions.remove([customer]),
    };
  };

  const rowActions = (row: CustomerRow): TableAction[] =>
    toTableActions(
      customerMenuItems(
        row.customer,
        { status: row.status, debtUsd: row.debtUsd, currencies },
        { isAdmin },
      ),
      t,
      { icons: CUSTOMER_ACTION_ICONS, run: runFor(row), disabled: quickPay.bulkBusy ? ["quick_pay"] : [] },
    );

  const bulkActions = (selected: CustomerRow[]): TableAction[] => {
    const one = selected.length === 1 ? selected[0] : null;
    const customers = selected.map((row) => row.customer);
    const run: Partial<Record<CustomerActionKey, () => void>> = {
      ...(one ? runFor(one) : {}),
      quick_pay: one
        ? () => void quickPay.quickPay(targetOf(one))
        : () => void quickPay.bulkQuickPay(selected.map(targetOf)),
      delete: () => void adminActions.remove(customers),
    };
    return toTableActions(customerSelectionItems(customers, { isAdmin }), t, {
      icons: CUSTOMER_ACTION_ICONS,
      run,
      disabled: quickPay.bulkBusy || adminActions.busy ? ["quick_pay", "delete"] : [],
    });
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
      <ErrorBanner message={sale.error} onDismiss={sale.clearError} />
      <ErrorBanner message={sale.notice} onDismiss={sale.clearNotice} severity="info" />
      {debts.banners}
      <CustomerFiltersBar value={query.filters} onChange={setFilters} onClear={clearFilters} />
      <DataTable<CustomerRow>
        label={t("customers.title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
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
      />
      {form ? (
        <CustomerFormDialog
          customer={form.customer}
          onClose={() => setForm(null)}
          onSaved={() => setForm(null)}
        />
      ) : null}
      {history.dialog}
      {collect.dialog}
      {sale.dialogs}
      {debts.dialogs}
    </Stack>
  );
}
