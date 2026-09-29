import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Currency, Product } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { decimalDigitsOnly, digitsOnly } from "@shared/core/utils/inputText";
import { useBatchRestockForm } from "@shared/modules/admin/products/hooks/useBatchRestockForm";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { FormDialog } from "@/shared/components/FormDialog";

const USD_OPTION = "";

interface BatchRestockDialogProps {
  onClose: () => void;
  onSaved: () => void;
}

// One delivery, one save: each picked product becomes its own restock entry.
export function BatchRestockDialog({ onClose, onSaved }: BatchRestockDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const products = useProductSlice((s) => s.items);
  const productsLoaded = useProductSlice((s) => s.loaded);
  const fetchProducts = useProductSlice((s) => s.fetchProducts);
  const batchRestock = useProductSlice((s) => s.batchRestock);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const form = useBatchRestockForm(products, currencies);
  const { entries, visible, deliveryCurrency, totalUnits, totalCost } = form;
  const [pickError, setPickError] = useState<string | null>(null);
  const hasProducts = form.activeProducts.length > 0;

  useEffect(() => {
    clearError();
    void fetchProducts();
    return clearError;
  }, [clearError, fetchProducts]);

  const setQuantity = (productId: string, quantity: number) => {
    clearError();
    setPickError(null);
    form.setQuantity(productId, quantity);
  };

  const submit = async () => {
    if (!user) return;
    if (entries.length === 0) {
      setPickError(t("web.products.pick_one"));
      return;
    }
    const saved = await batchRestock(entries, user.tenantId, form.note, user.id, deliveryCurrency);
    if (!saved) return;
    onSaved();
    onClose();
  };

  return (
    <FormDialog
      open
      title={t("products.batch_restock_title")}
      onClose={onClose}
      onSubmit={submit}
      dirty={form.dirty}
      error={error ?? pickError}
      onDismissError={() => {
        clearError();
        setPickError(null);
      }}
      submitLabel={t("products.batch_restock_save")}
      maxWidth="md"
    >
      <Typography variant="body2" color="text.secondary">
        {t("products.batch_restock_subtitle")}
      </Typography>
      {!productsLoaded ? (
        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : !hasProducts ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          {t("products.batch_restock_no_products")}
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <TextField
              size="small"
              type="search"
              label={t("products.batch_restock_search")}
              value={form.search}
              onChange={(event) => form.setSearch(event.target.value)}
              sx={{ flexGrow: 1 }}
            />
            {entries.length > 0 ? (
              <Button onClick={form.clearAll}>{t("common.clear")}</Button>
            ) : null}
          </Stack>
          <RestockTable
            products={visible}
            quantities={form.quantities}
            costs={form.costs}
            currency={deliveryCurrency}
            onQuantity={setQuantity}
            onCost={form.setCost}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              label={t("products.delivery_currency_label")}
              value={form.currencyId ?? USD_OPTION}
              onChange={(event) =>
                form.changeCurrency(event.target.value === USD_OPTION ? null : event.target.value)
              }
              sx={{ minWidth: 200 }}
            >
              <MenuItem value={USD_OPTION}>USD</MenuItem>
              {currencies
                .filter((c) => c.active)
                .map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label={t("products.batch_restock_note_label")}
              value={form.note}
              onChange={(event) => form.setNote(event.target.value)}
              placeholder={t("products.stock_note_placeholder")}
              fullWidth
            />
          </Stack>
          <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">
                {t("products.batch_restock_selected", { count: entries.length })}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700 }}
                color={totalUnits > 0 ? "success.main" : "text.disabled"}
              >
                +{totalUnits}
              </Typography>
            </Stack>
            {totalCost > 0 ? (
              <Stack direction="row" sx={{ justifyContent: "space-between", mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {t("products.total_cost_label")}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }} color="warning.dark">
                  {formatMoney(totalCost, deliveryCurrency, deliveryCurrency)}
                </Typography>
              </Stack>
            ) : null}
          </Paper>
        </>
      )}
    </FormDialog>
  );
}

interface RestockTableProps {
  products: Product[];
  quantities: Record<string, number>;
  costs: Record<string, string>;
  currency: Currency | null;
  onQuantity: (productId: string, quantity: number) => void;
  onCost: (productId: string, text: string) => void;
}

function RestockTable({ products, quantities, costs, currency, onQuantity, onCost }: RestockTableProps) {
  const { t } = useTranslation();
  if (products.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
        {t("products.batch_restock_no_match")}
      </Typography>
    );
  }
  const currencyMark = currency?.symbol ?? currency?.code ?? "$";
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
      <Table size="small" stickyHeader aria-label={t("products.batch_restock_products", { count: products.length })}>
        <TableHead>
          <TableRow>
            <TableCell>{t("products.name_label")}</TableCell>
            <TableCell align="right">{t("products.stock_on_hand")}</TableCell>
            <TableCell sx={{ width: 120 }}>{t("products.stock_quantity_label")}</TableCell>
            <TableCell sx={{ width: 160 }}>{t("products.cost_per_unit_label")}</TableCell>
            <TableCell align="right">{t("web.products.new_stock")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => {
            const quantity = quantities[product.id] ?? 0;
            const picked = quantity > 0;
            return (
              <TableRow key={product.id} selected={picked}>
                <TableCell sx={{ fontWeight: 600 }}>{product.name}</TableCell>
                <TableCell align="right">{product.stockOnHand}</TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={picked ? String(quantity) : ""}
                    onChange={(event) =>
                      onQuantity(product.id, Number(digitsOnly(event.target.value)) || 0)
                    }
                    placeholder="0"
                    slotProps={{
                      htmlInput: {
                        inputMode: "numeric",
                        "aria-label": `${t("products.stock_quantity_label")} · ${product.name}`,
                      },
                    }}
                  />
                </TableCell>
                <TableCell>
                  {picked ? (
                    <TextField
                      size="small"
                      value={costs[product.id] ?? ""}
                      onChange={(event) => onCost(product.id, decimalDigitsOnly(event.target.value))}
                      placeholder="0.00"
                      slotProps={{
                        htmlInput: {
                          inputMode: "decimal",
                          "aria-label": `${t("products.cost_per_unit_label")} · ${product.name}`,
                        },
                        input: {
                          endAdornment: <InputAdornment position="end">{currencyMark}</InputAdornment>,
                        },
                      }}
                    />
                  ) : null}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: picked ? 700 : undefined, color: picked ? "success.main" : "text.disabled" }}
                >
                  {picked ? product.stockOnHand + quantity : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
