import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import type { GridColDef } from "@mui/x-data-grid";
import type { Customer, Sale } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { receiptId, saleTitle } from "@shared/core/utils/receiptId";
import { useCustomerSalesPreview } from "@shared/modules/transaction/sales/hooks/useCustomerSalesPreview";
import { saleFacts } from "@shared/modules/transaction/sales/utils/saleView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { PanelSection } from "@/shared/components/PanelSection";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { SaleStatusChips } from "./SaleStatusChips";
import { useSaleDoors } from "../hooks/useSaleDoors";

const PREVIEW_LIMIT = 10;

const titleOf = (sale: Sale) => saleTitle(sale.id, sale.itemsSummary);

// The latest sales only; "Show all" opens the customer's full sales page.
export function CustomerSalesPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const sales = useCustomerSalesPreview(customer.id, PREVIEW_LIMIT);
  const { refresh } = sales;
  const doors = useSaleDoors({ onChanged: () => void refresh() });

  const money = (amount: number, sale: Sale) => {
    const currency = snapshotCurrency(sale, currencies);
    return formatMoney(amount, currency, currency);
  };

  const columns: GridColDef<Sale>[] = [
    {
      field: "receipt",
      headerName: t("sales.receipt_id_label"),
      width: 130,
      valueGetter: (_value, row) => `#${receiptId(row.id)}`,
      renderCell: (params) => (
        <RowLink
          label={`#${receiptId(params.row.id)}`}
          tabIndex={params.tabIndex}
          onClick={() => doors.openReceipt(params.row)}
        />
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
      renderCell: (params) => <MoneyText primary={money(params.row.totalAmount, params.row)} />,
    },
    {
      field: "owed",
      headerName: t("web.customer_detail.still_owed"),
      width: 140,
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
      renderCell: (params) => <SaleStatusChips sale={params.row} />,
    },
  ];

  const rows = sales.items;

  return (
    <PanelSection
      title={t("sales.customer_panel_title")}
      actions={
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          {sales.hasMore ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {t("web.customer_detail.latest_sales", { limit: PREVIEW_LIMIT })}
              </Typography>
              <Button variant="outlined" size="small" href={`/customers/${customer.id}/sales`}>
                {t("sales.show_all")}
              </Button>
            </>
          ) : null}
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => doors.recordSale(customer)}>
            {t("web.sales.record")}
          </Button>
        </Stack>
      }
    >
      <ErrorBanner message={sales.error} onDismiss={sales.clearError} />
      <ErrorBanner message={doors.error} onDismiss={doors.clearError} />
      <ErrorBanner message={doors.notice} onDismiss={doors.clearNotice} severity="info" />
      {sales.loading && rows.length === 0 ? (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, px: 2, textAlign: "center" }}>
          <Typography color="text.secondary">{t("sales.no_sales_for_customer")}</Typography>
        </Paper>
      ) : (
        <LocalTable<Sale>
          label={t("sales.customer_panel_title")}
          columns={columns}
          rows={rows}
          rowLabel={titleOf}
          rowActions={doors.rowActions}
          rowTone={(row) => (row.voidedAt ? "muted" : null)}
          autoRowHeight
        />
      )}
      {doors.dialogs}
    </PanelSection>
  );
}
