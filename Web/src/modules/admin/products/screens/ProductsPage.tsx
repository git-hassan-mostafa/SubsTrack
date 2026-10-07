import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import MoveToInboxOutlined from "@mui/icons-material/MoveToInboxOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Product } from "@shared/core/types";
import { stockLevelLabel } from "@shared/modules/admin/products/utils/stockText";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useUiStore } from "@shared/shared/lib/uiStore";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { useMoneyPair } from "@shared/shared/hooks/useMoneyPair";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { useCatalogRowActions } from "@/shared/table/useCatalogRowActions";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllProducts, useProductsTable } from "@/state/productsTable";
import { useHistoryDoor } from "@/modules/admin/audit/hooks/useHistoryDoor";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { ProductStockDialog } from "../components/ProductStockDialog";

export function ProductsPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(useProductsTable, branch);
  const rows = paged.tableProps.rows;
  const query = paged.query;
  const patchRow = paged.patchRow;
  const addRow = paged.addRow;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const writeError = useProductSlice((s) => s.error);
  const clearWriteError = useProductSlice((s) => s.clearError);
  const deleteProduct = useProductSlice((s) => s.deleteProduct);
  const reactivateProduct = useProductSlice((s) => s.reactivateProduct);
  const bulkDeleteProducts = useProductSlice((s) => s.bulkDeleteProducts);
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const moneyPair = useMoneyPair();
  const branchColumn = useBranchColumn<Product>(t("branches.shared_all_branches"));
  const history = useHistoryDoor("products");
  const [form, setForm] = useState<{ product: Product | null } | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);

  const liveRow = (product: Product) => rows.find((row) => row.id === product.id) ?? product;
  const dialogOpen = form !== null || stockFor !== null;

  const { rowActions, bulkActions } = useCatalogRowActions<Product>({
    kind: "product",
    textKeys: "products",
    nameValues: (product) => ({ name: product.name }),
    remove: deleteProduct,
    removeMany: bulkDeleteProducts,
    reactivate: reactivateProduct,
    patchRow,
    reload,
    doors: (product) => ({
      edit: () => setForm({ product }),
      stock: () => setStockFor(product),
      history: () => history.open(product.id, product.name),
    }),
  });

  const columns: GridColDef<Product>[] = [
    {
      field: "name",
      headerName: t("products.name_label"),
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <RowLink
          label={params.row.name}
          tabIndex={params.tabIndex}
          onClick={() => setForm({ product: params.row })}
        />
      ),
    },
    {
      field: "description",
      headerName: t("products.description_label"),
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_value, row) => row.description ?? "",
    },
    ...(branchColumn ? [branchColumn] : []),
    {
      field: "price",
      headerName: t("products.price_label"),
      width: 170,
      renderCell: (params) => {
        const money = moneyPair(params.row.price, params.row.currencyId);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
    {
      field: "costPrice",
      headerName: t("web.products.cost"),
      width: 150,
      renderCell: (params) => {
        if (params.row.costPrice == null) return null;
        const money = moneyPair(params.row.costPrice, params.row.costCurrencyId);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
    {
      field: "stockOnHand",
      headerName: t("web.products.stock"),
      width: 150,
      renderCell: (params) => (
        <StatusChip
          label={stockLevelLabel(t, params.row.stockOnHand)}
          tone={params.row.stockOnHand > 0 ? "emerald" : "red"}
        />
      ),
    },
    activeStatusColumn<Product>(t),
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={dialogOpen ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Product>
        viewKey="products"
        label={t("products.title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
          placeholder: t("web.products.search"),
        }}
        filters={
          <ActiveFilterSelect
            value={query.filters.status}
            onChange={(status) => setFilters({ status })}
          />
        }
        toolbarActions={
          <Button
            variant="outlined"
            startIcon={<MoveToInboxOutlined />}
            onClick={() => openQuickAction("batchRestock")}
          >
            {t("web.products.restock_several")}
          </Button>
        }
        add={{ label: t("web.products.add"), onClick: () => setForm({ product: null }) }}
        exportConfig={{ nameKey: "products.title", loadAll: () => readAllProducts(query) }}
        rowLabel={(product) => product.name}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("products.no_products"), hint: t("products.no_products_hint") }}
        filtered={query.search !== "" || query.filters.status !== "all"}
      />
      {form ? (
        <ProductFormDialog
          product={form.product ? liveRow(form.product) : null}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.product) patchRow(saved);
            else addRow(saved);
          }}
          onAdjustStock={setStockFor}
        />
      ) : null}
      {stockFor ? (
        <ProductStockDialog
          product={liveRow(stockFor)}
          onClose={() => setStockFor(null)}
          onChanged={(onHand) => patchRow({ ...liveRow(stockFor), stockOnHand: onHand })}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
