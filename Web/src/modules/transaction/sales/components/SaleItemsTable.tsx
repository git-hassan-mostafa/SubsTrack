import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Currency, Sale, SaleItem } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { roundMoney } from "@shared/modules/ledger/utils/waterfall";
import { LocalTable } from "@/shared/table/LocalTable";

interface SaleItemsTableProps {
  sale: Sale;
  source: Currency | null;
}

// The typed total may differ from the lines (a discount, #142): say so, never fix it.
export function SaleItemsTable({ sale, source }: SaleItemsTableProps) {
  const { t } = useTranslation();
  const money = (value: number) => formatMoney(value, source, source);
  const lineSum = roundMoney(sale.items.reduce((sum, item) => sum + item.lineTotal, 0));
  const typedTotal = sale.items.length > 0 && lineSum !== roundMoney(sale.totalAmount);

  if (sale.items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {t("web.sales.no_items", { amount: money(sale.totalAmount) })}
        </Typography>
      </Paper>
    );
  }

  const columns: GridColDef<SaleItem>[] = [
    {
      field: "itemNameSnapshot",
      headerName: t("web.sales.item"),
      flex: 1.6,
      minWidth: 180,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", height: "100%" }}>
          {params.row.lineType === "service" ? (
            <BuildOutlined color="primary" sx={{ fontSize: 18 }} titleAccess={t("sales.line_type_service")} />
          ) : null}
          <span>{params.row.itemNameSnapshot}</span>
        </Stack>
      ),
    },
    {
      field: "quantity",
      headerName: t("sales.quantity_label"),
      width: 110,
      valueGetter: (_value, row) => (row.lineType === "service" ? "" : row.quantity),
    },
    {
      field: "unitAmount",
      headerName: t("sales.unit_amount_label"),
      width: 150,
      valueGetter: (_value, row) => money(row.unitAmount),
    },
    {
      field: "lineTotal",
      headerName: t("sales.total_label"),
      width: 150,
      valueGetter: (_value, row) => money(row.lineTotal),
    },
  ];

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
        {t("sales.items_section_title")}
      </Typography>
      <LocalTable<SaleItem> label={t("sales.items_section_title")} columns={columns} rows={sale.items} />
      {typedTotal ? (
        <Typography variant="body2" color="text.secondary">
          {t("sales.total_differs_hint", { calculated: money(lineSum) })}
        </Typography>
      ) : null}
    </Stack>
  );
}
