import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Customer, Sale } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { receiptId, saleTitle } from "@shared/core/utils/receiptId";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { useCustomerSalesPreview } from "@shared/modules/transaction/sales/hooks/useCustomerSalesPreview";
import { saleFacts } from "@shared/modules/transaction/sales/utils/saleView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { PanelSection } from "@/shared/components/PanelSection";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { BillHistoryDialog } from "@/modules/admin/audit/RecordHistoryDialog";
import { useBillDialog } from "@/modules/ledger/bill/useBillDialog";
import { useCollectDialog } from "@/modules/ledger/collect/useCollectDialog";

const PREVIEW_LIMIT = 10;

type SaleRow = Sale & { id: string };

// The latest sales only; the receipt, edit and void doors arrive with the Sales page.
export function CustomerSalesPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const sales = useCustomerSalesPreview(customer.id, PREVIEW_LIMIT);
  const { patch } = sales;
  const collect = useCollectDialog({
    onCollected: (collections) => collections.forEach(patch.collected),
  });
  const bill = useBillDialog({ onChanged: patch.paymentChanged });
  const [historySale, setHistorySale] = useState<Sale | null>(null);
  const recipient = { name: customer.name, phone: customer.phoneNumber };

  const titleOf = (sale: Sale) => saleTitle(sale.id, sale.itemsSummary);

  const openBill = (sale: Sale) => {
    if (sale.charge) bill.openCharge(sale.charge, titleOf(sale), customer.name, recipient);
  };

  const collectRest = (sale: Sale) => {
    if (!sale.charge) return;
    collect.openOne(
      customer.name,
      openItemFromCharge(sale.charge, sale.amountPaid, sale.itemsSummary, customer.name),
    );
  };

  const money = (amount: number, sale: Sale) => {
    const currency = snapshotCurrency(sale, currencies);
    return formatMoney(amount, currency, currency);
  };

  const rowActions = (sale: SaleRow): TableAction[] => {
    const facts = saleFacts(sale);
    const actions: TableAction[] = [];
    if (facts.canCollect) {
      actions.push({
        key: "collect",
        group: "money",
        label: t("ledger.collect_remaining", { amount: money(facts.owed, sale) }),
        icon: PaymentsOutlined,
        onClick: () => collectRest(sale),
      });
    }
    if (sale.charge) {
      actions.push({
        key: "bill",
        group: "open",
        label: t("web.customer_detail.sale_bill"),
        icon: ReceiptLongOutlined,
        onClick: () => openBill(sale),
      });
    }
    if (isAdmin) {
      actions.push({
        key: "history",
        group: "history",
        label: t("audit.history"),
        icon: HistoryOutlined,
        onClick: () => setHistorySale(sale),
      });
    }
    return actions;
  };

  const columns: GridColDef<SaleRow>[] = [
    {
      field: "receipt",
      headerName: t("sales.receipt_id_label"),
      width: 130,
      valueGetter: (_value, row) => `#${receiptId(row.id)}`,
      renderCell: (params) =>
        params.row.charge ? (
          <RowLink
            label={`#${receiptId(params.row.id)}`}
            tabIndex={params.tabIndex}
            onClick={() => openBill(params.row)}
          />
        ) : (
          `#${receiptId(params.row.id)}`
        ),
    },
    {
      field: "soldAt",
      headerName: t("sales.sold_at_label"),
      width: 130,
      valueGetter: (_value, row) => formatDate(row.soldAt),
    },
    {
      field: "itemsSummary",
      headerName: t("sales.items_section_title"),
      flex: 1.4,
      minWidth: 180,
    },
    {
      field: "totalAmount",
      headerName: t("sales.total_label"),
      width: 140,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => <MoneyText primary={money(params.row.totalAmount, params.row)} />,
    },
    {
      field: "owed",
      headerName: t("web.customer_detail.still_owed"),
      width: 140,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        const facts = saleFacts(params.row);
        return facts.voided || facts.fullyPaid ? null : <MoneyText primary={money(facts.owed, params.row)} />;
      },
    },
    {
      field: "status",
      headerName: t("customers.status_label"),
      flex: 1,
      minWidth: 160,
      renderCell: (params) => <SaleChips sale={params.row} />,
    },
  ];

  const rows: SaleRow[] = sales.items;

  return (
    <PanelSection
      title={t("sales.customer_panel_title")}
      actions={
        sales.hasMore ? (
          <Typography variant="body2" color="text.secondary">
            {t("web.customer_detail.latest_sales", { limit: PREVIEW_LIMIT })}
          </Typography>
        ) : null
      }
    >
      <ErrorBanner message={sales.error} onDismiss={sales.clearError} />
      <ErrorBanner message={bill.error} onDismiss={bill.clearError} />
      {sales.loading && rows.length === 0 ? (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, px: 2, textAlign: "center" }}>
          <Typography color="text.secondary">{t("sales.no_sales_for_customer")}</Typography>
        </Paper>
      ) : (
        <LocalTable<SaleRow>
          label={t("sales.customer_panel_title")}
          columns={columns}
          rows={rows}
          rowLabel={titleOf}
          rowActions={rowActions}
          rowTone={(row) => (row.voidedAt ? "muted" : null)}
          autoRowHeight
        />
      )}
      {collect.dialog}
      {bill.dialog}
      {historySale ? (
        <BillHistoryDialog
          chargeId={historySale.chargeId}
          targets={[{ table: "sales", recordId: historySale.id }]}
          name={titleOf(historySale)}
          onClose={() => setHistorySale(null)}
        />
      ) : null}
    </PanelSection>
  );
}

// Voided, written off and "no items" are the facts the total alone hides.
function SaleChips({ sale }: { sale: Sale }) {
  const { t } = useTranslation();
  const facts = saleFacts(sale);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      {facts.voided ? (
        <Tooltip title={sale.voidReason ?? ""}>
          <span>
            <StatusChip label={t("sales.voided")} tone="red" />
          </span>
        </Tooltip>
      ) : facts.fullyPaid ? (
        <StatusChip label={t("web.bill.paid_in_full")} tone="emerald" />
      ) : sale.amountPaid > 0 ? (
        <StatusChip label={t("web.customer_detail.part_paid")} tone="amber" />
      ) : (
        <StatusChip label={t("web.bill.label_open")} tone="red" />
      )}
      {facts.writtenOff ? <StatusChip label={t("ledger.written_off")} tone="orange" /> : null}
      {!facts.voided && sale.items.length === 0 ? <StatusChip label={t("sales.no_items_chip")} tone="violet" /> : null}
    </Stack>
  );
}
