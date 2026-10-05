import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import MoveToInboxOutlined from "@mui/icons-material/MoveToInboxOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Product } from "@shared/core/types";
import { stockLevelLabel } from "@shared/modules/admin/products/utils/stockText";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { confirm } from "@shared/shared/lib/confirm";
import { useUiStore } from "@shared/shared/lib/uiStore";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { useMoneyPair } from "@/shared/hooks/useMoneyPair";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { CATALOG_ACTION_ICONS } from "@/shared/table/catalogActionIcons";
import {
  catalogRowActions,
  catalogSelectionActions,
  type CatalogActionKey,
} from "@shared/shared/lib/catalogMenu";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllProducts, useProductsTable } from "@/state/productsTable";
import { useHistoryDoor } from "@/modules/admin/audit/useHistoryDoor";
import { ProductFormDialog } from "./ProductFormDialog";
import { ProductStockDialog } from "./ProductStockDialog";

export function ProductsPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(useProductsTable, branch);
  const rows = paged.tableProps.rows;
  const query = paged.query;
  const patchRow = paged.patchRow;
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

  const confirmDelete = (products: Product[]) => {
    const single = products.length === 1 ? products[0] : null;
    return confirm({
      title: single
        ? t("products.delete_title")
        : t("products.bulk_delete_title", { count: products.length }),
      message: single
        ? t("products.delete_message", { name: single.name })
        : t("products.bulk_delete_message", { count: products.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? (await deleteProduct(single.id)) !== null
          : await bulkDeleteProducts(products.map((p) => p.id));
        if (done) reload();
      },
    });
  };

  const reactivate = async (product: Product) => {
    const updated = await reactivateProduct(product.id);
    if (updated) patchRow(updated);
  };

  const runFor = (product: Product): Partial<Record<CatalogActionKey, () => void>> => ({
    edit: () => setForm({ product }),
    stock: () => setStockFor(product),
    history: () => history.open(product.id, product.name),
    reactivate: () => void reactivate(product),
  });

  const rowActions = (product: Product): TableAction[] =>
    toTableActions(catalogRowActions("product", product), t, {
      icons: CATALOG_ACTION_ICONS,
      run: { ...runFor(product), delete: () => void confirmDelete([product]) },
    });

  const bulkActions = (selected: Product[]): TableAction[] =>
    toTableActions(catalogSelectionActions("product", selected), t, {
      icons: CATALOG_ACTION_ICONS,
      run: {
        ...(selected.length === 1 ? runFor(selected[0]) : {}),
        delete: () => void confirmDelete(selected),
      },
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
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        const money = moneyPair(params.row.price, params.row.currencyId);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
    {
      field: "costPrice",
      headerName: t("web.products.cost"),
      width: 150,
      align: "right",
      headerAlign: "right",
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
            else reload();
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
