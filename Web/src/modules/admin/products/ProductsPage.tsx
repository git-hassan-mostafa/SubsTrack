import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import MoveToInboxOutlined from "@mui/icons-material/MoveToInboxOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
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
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllProducts, useProductsTable } from "@/state/productsTable";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";
import { ProductFormDialog } from "./ProductFormDialog";
import { ProductStockDialog } from "./ProductStockDialog";

export function ProductsPage() {
  const { t } = useTranslation();
  const rows = useProductsTable((s) => s.rows);
  const total = useProductsTable((s) => s.total);
  const loaded = useProductsTable((s) => s.loaded);
  const loading = useProductsTable((s) => s.loading);
  const tableError = useProductsTable((s) => s.error);
  const query = useProductsTable((s) => s.query);
  const load = useProductsTable((s) => s.load);
  const open = useProductsTable((s) => s.open);
  const setPage = useProductsTable((s) => s.setPage);
  const setSearch = useProductsTable((s) => s.setSearch);
  const setFilters = useProductsTable((s) => s.setFilters);
  const clearFilters = useProductsTable((s) => s.clearFilters);
  const clearTableError = useProductsTable((s) => s.clearError);
  const writeError = useProductSlice((s) => s.error);
  const clearWriteError = useProductSlice((s) => s.clearError);
  const deleteProduct = useProductSlice((s) => s.deleteProduct);
  const reactivateProduct = useProductSlice((s) => s.reactivateProduct);
  const bulkDeleteProducts = useProductSlice((s) => s.bulkDeleteProducts);
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const branch = useEffectiveBranchFilter();
  const moneyPair = useMoneyPair();
  const branchColumn = useBranchColumn<Product>(t("branches.shared_all_branches"));
  const history = useRecordHistoryAction("products");
  const [form, setForm] = useState<{ product: Product | null } | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const reload = () => void load();
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
    if (await reactivateProduct(product.id)) reload();
  };

  const editAction = (product: Product): TableAction => ({
    key: "edit",
    group: "manage",
    label: t("common.edit"),
    icon: EditOutlined,
    onClick: () => setForm({ product }),
  });

  const stockAction = (product: Product): TableAction => ({
    key: "stock",
    group: "manage",
    label: t("products.adjust_stock_title"),
    icon: Inventory2Outlined,
    onClick: () => setStockFor(product),
  });

  const reactivateAction = (product: Product): TableAction => ({
    key: "reactivate",
    group: "status",
    label: t("common.reactivate"),
    icon: PlayCircleOutlined,
    onClick: () => void reactivate(product),
  });

  const deleteAction = (products: Product[]): TableAction => ({
    key: "delete",
    group: "danger",
    label: t("common.delete"),
    icon: DeleteOutlined,
    destructive: true,
    onClick: () => void confirmDelete(products),
  });

  const rowActions = (product: Product): TableAction[] =>
    product.active
      ? [editAction(product), stockAction(product), history.action(product.id, product.name), deleteAction([product])]
      : [editAction(product), history.action(product.id, product.name), reactivateAction(product)];

  const bulkActions = (selected: Product[]): TableAction[] => {
    if (selected.length > 1) return [deleteAction(selected)];
    const one = selected[0];
    return one.active
      ? [editAction(one), stockAction(one), deleteAction(selected)]
      : [editAction(one), reactivateAction(one), deleteAction(selected)];
  };

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
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onRetry={reload}
      />
      {form ? (
        <ProductFormDialog
          product={form.product ? liveRow(form.product) : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
          onAdjustStock={setStockFor}
        />
      ) : null}
      {stockFor ? (
        <ProductStockDialog
          product={liveRow(stockFor)}
          onClose={() => setStockFor(null)}
          onChanged={reload}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
