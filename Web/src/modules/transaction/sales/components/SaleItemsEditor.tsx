import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddCircleOutlined from "@mui/icons-material/AddCircleOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import type { Product, SaleLineType, Service } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import type { SaleCart } from "@shared/modules/transaction/sales/hooks/useSaleCart";
import type { CartRow } from "@shared/modules/transaction/sales/utils/saleCart";
import { ProductFormDialog } from "@/modules/admin/products/components/ProductFormDialog";
import { ServiceFormDialog } from "@/modules/admin/services/components/ServiceFormDialog";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { CurrencySelect } from "@/shared/components/CurrencySelect";
import { useProductsTable } from "@/state/productsTable";
import { useServicesTable } from "@/state/servicesTable";
import { CatalogPicker } from "./CatalogPicker";
import { QuantityField } from "./QuantityField";
import { ServicePicker } from "./ServicePicker";

const KIND_ICON: Record<SaleLineType, SvgIconComponent> = {
  product: Inventory2Outlined,
  service: BuildOutlined,
};

type NewItemFor = { kind: SaleLineType; rowKey: string } | null;

// The rows and their rules live in Shared useSaleCart; this only draws them.
export function SaleItemsEditor({ cart }: { cart: SaleCart }) {
  const { t } = useTranslation();
  const [newItemFor, setNewItemFor] = useState<NewItemFor>(null);

  const productCreated = (product: Product) => {
    if (newItemFor) cart.selectProduct(newItemFor.rowKey, product);
    useProductsTable.getState().addRow(product);
    setNewItemFor(null);
  };

  const serviceCreated = (service: Service) => {
    if (newItemFor) cart.selectService(newItemFor.rowKey, service);
    useServicesTable.getState().addRow(service);
    setNewItemFor(null);
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography component="h3" sx={{ fontWeight: 700 }}>
            {t("sales.items_section_title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("sales.items_section_subtitle")}
          </Typography>
        </Box>
        <CurrencySelect
          size="small"
          label={t("sales.sale_currency_label")}
          value={cart.currencyId}
          onChange={cart.changeCurrency}
          currencies={cart.currencies}
          sx={{ width: 180 }}
        />
      </Stack>
      {cart.rows.map((row) => (
        <SaleLineRow
          key={row.key}
          row={row}
          cart={cart}
          onNewItem={() => setNewItemFor({ kind: row.lineType, rowKey: row.key })}
        />
      ))}
      <Stack direction="row" spacing={1.5}>
        <Button variant="outlined" startIcon={<Inventory2Outlined />} onClick={() => cart.addRow("product")}>
          {t("sales.add_product")}
        </Button>
        <Button variant="outlined" startIcon={<BuildOutlined />} onClick={() => cart.addRow("service")}>
          {t("sales.add_service")}
        </Button>
      </Stack>
      {newItemFor?.kind === "product" ? (
        <ProductFormDialog product={null} onClose={() => setNewItemFor(null)} onSaved={productCreated} />
      ) : null}
      {newItemFor?.kind === "service" ? (
        <ServiceFormDialog service={null} onClose={() => setNewItemFor(null)} onSaved={serviceCreated} />
      ) : null}
    </Stack>
  );
}

interface SaleLineRowProps {
  row: CartRow;
  cart: SaleCart;
  onNewItem: () => void;
}

// A product line counts units against the stock left; a service is one price.
function SaleLineRow({ row, cart, onNewItem }: SaleLineRowProps) {
  const { t } = useTranslation();
  const { currencies, currency: saleCurrency } = cart;
  const isProduct = row.lineType === "product";
  const KindIcon = KIND_ICON[row.lineType];
  const kindLabel = t(isProduct ? "sales.line_type_product" : "sales.line_type_service");
  const newLabel = t(isProduct ? "web.sales.new_product" : "web.sales.new_service");
  const catalogPrice = (item: Product | Service) =>
    formatMoney(item.price, findCurrency(currencies, item.currencyId), saleCurrency);
  const lineTotal =
    row.unitAmount != null && row.unitAmount > 0
      ? formatMoney(row.unitAmount * row.quantity, saleCurrency, saleCurrency)
      : null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "flex-start" } }}>
        <Tooltip title={kindLabel}>
          <Box sx={{ color: isProduct ? "success.main" : "primary.main", pt: 1, display: { xs: "none", md: "block" } }}>
            <KindIcon aria-label={kindLabel} />
          </Box>
        </Tooltip>
        <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
            {isProduct ? (
              <CatalogPicker<Product>
                label={t("sales.product_label")}
                value={cart.products.find((p) => p.id === row.productId) ?? null}
                options={cart.products}
                onChange={(product) => cart.selectProduct(row.key, product)}
                sublabel={(product) => {
                  const pool = cart.poolOf(product);
                  return pool > 0
                    ? `${catalogPrice(product)} · ${t("sales.stock_left", { quantity: pool })}`
                    : t("products.out_of_stock");
                }}
                optionDisabled={(product) => cart.poolOf(product) <= 0 || !product.active}
                placeholder={t("sales.product_placeholder")}
                required
              />
            ) : (
              <ServicePicker
                value={cart.services.find((s) => s.id === row.serviceId) ?? null}
                customName={row.customName}
                options={cart.services}
                onSelect={(service) => cart.selectService(row.key, service)}
                onType={(name) => cart.setCustomName(row.key, name)}
                sublabel={catalogPrice}
              />
            )}
            <Tooltip title={newLabel}>
              <IconButton aria-label={newLabel} onClick={onNewItem}>
                <AddCircleOutlined />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        {isProduct ? (
          <QuantityField
            label={t("sales.quantity_label")}
            value={row.quantity}
            onChange={(quantity) => cart.setQuantity(row.key, quantity)}
            helperText={
              row.productId
                ? t("sales.stock_left", { quantity: cart.availableFor(row.key, row.productId) })
                : undefined
            }
          />
        ) : null}
        <Box sx={{ width: { md: 200 } }}>
          <CurrencyInput
            label={t(isProduct ? "sales.unit_amount_label" : "sales.service_price_label")}
            amount={row.unitAmount}
            currencyId={cart.currencyId}
            onChange={(next) => cart.setUnitAmount(row.key, next.amount)}
            currencies={currencies}
            size="small"
            lockCurrency
            required
          />
        </Box>
        <Typography
          sx={{ width: { md: 110 }, pt: { md: 1 }, textAlign: { md: "right" }, fontWeight: 600 }}
          aria-label={t("web.sales.line_total")}
        >
          {lineTotal ?? ""}
        </Typography>
        <Tooltip title={t("sales.remove_item")}>
          <IconButton
            color="error"
            aria-label={t("sales.remove_item")}
            onClick={() => cart.removeRow(row.key)}
            sx={{ alignSelf: { xs: "flex-end", md: "flex-start" } }}
          >
            <DeleteOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
