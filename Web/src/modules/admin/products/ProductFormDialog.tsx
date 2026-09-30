import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Product } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { digitsOnly } from "@shared/core/utils/inputText";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";

interface ProductFormDialogProps {
  product: Product | null;
  onClose: () => void;
  onSaved: (saved: Product) => void;
  onAdjustStock: (product: Product) => void;
}

type ProductForm = {
  name: string;
  description: string;
  price: number | null;
  currencyId: string | null;
  costPrice: number | null;
  costCurrencyId: string | null;
  branchId: string | null;
  initialStock: string;
};

// Stock is typed once on create; after that only the stock dialog changes it.
export function ProductFormDialog({
  product,
  onClose,
  onSaved,
  onAdjustStock,
}: ProductFormDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createProduct = useProductSlice((s) => s.createProduct);
  const updateProduct = useProductSlice((s) => s.updateProduct);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const activeBranches = useActiveBranches();
  const [form, setForm] = useState<ProductForm>({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? null,
    currencyId: product?.currencyId ?? null,
    costPrice: product?.costPrice ?? null,
    costCurrencyId: product?.costCurrencyId ?? null,
    branchId: product ? product.branchId : defaultNewBranchId(user, activeBranches),
    initialStock: "",
  });
  const dirty = useDirtyForm(form, ["currencyId", "costCurrencyId"]);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<ProductForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (error) clearError();
  };

  const submit = async () => {
    if (!user) return;
    const data = {
      name: form.name,
      description: form.description.trim() || null,
      price: form.price ?? Number.NaN,
      currencyId: form.currencyId,
      costPrice: form.costPrice,
      costCurrencyId: form.costCurrencyId,
      branchId: form.branchId,
    };
    const saved = product
      ? await updateProduct(product.id, data)
      : await createProduct(
          { ...data, initialStock: Number(form.initialStock) || 0 },
          user.tenantId,
          user.id,
          findCurrency(currencies, form.costCurrencyId),
        );
    if (saved) onSaved(saved);
  };

  return (
    <FormDialog
      open
      title={product ? t("products.edit_title") : t("web.products.add")}
      onClose={onClose}
      onSubmit={submit}
      dirty={dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={product ? t("common.save_changes") : t("web.products.add")}
    >
      <TextField
        label={t("products.name_label")}
        value={form.name}
        onChange={(event) => change({ name: event.target.value })}
        placeholder={t("products.name_placeholder")}
        required
        autoFocus
        fullWidth
      />
      <TextField
        label={t("products.description_label")}
        value={form.description}
        onChange={(event) => change({ description: event.target.value })}
        placeholder={t("products.description_placeholder")}
        multiline
        minRows={2}
        fullWidth
      />
      <BranchPicker
        value={form.branchId}
        onChange={(branchId) => change({ branchId })}
        nullable={user?.branchId === null}
        nullLabel={t("branches.shared_all_branches")}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <CurrencyInput
          label={t("products.price_label")}
          amount={form.price}
          currencyId={form.currencyId}
          onChange={({ amount, currencyId }) => change({ price: amount, currencyId })}
          currencies={currencies}
          required
        />
        <CurrencyInput
          label={t("products.cost_price_label")}
          amount={form.costPrice}
          currencyId={form.costCurrencyId}
          onChange={({ amount, currencyId }) =>
            change({ costPrice: amount, costCurrencyId: currencyId })
          }
          currencies={currencies}
        />
      </Stack>
      {product ? (
        <Paper
          variant="outlined"
          sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 2 }}
        >
          <Stack sx={{ flexGrow: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("products.stock_on_hand")}
            </Typography>
            <Typography
              variant="h6"
              component="p"
              color={product.stockOnHand > 0 ? "text.primary" : "error"}
            >
              {product.stockOnHand}
            </Typography>
          </Stack>
          {product.active ? (
            <Button onClick={() => onAdjustStock(product)}>
              {t("products.adjust_stock_title")}
            </Button>
          ) : null}
        </Paper>
      ) : (
        <TextField
          label={t("products.initial_stock_label")}
          value={form.initialStock}
          onChange={(event) => change({ initialStock: digitsOnly(event.target.value) })}
          placeholder="0"
          fullWidth
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
        />
      )}
    </FormDialog>
  );
}
