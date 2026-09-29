import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import EditOutlined from "@mui/icons-material/EditOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import type { Product, StockMovement } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import { digitsOnly } from "@shared/core/utils/inputText";
import { useStockEntryForm } from "@shared/modules/admin/products/hooks/useStockEntryForm";
import productService from "@shared/modules/admin/products/services/ProductService";
import {
  signedQuantity,
  stockEntryLabel,
} from "@shared/modules/admin/products/utils/stockText";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";
import { StatusChip } from "@/shared/components/StatusChip";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import type { TableAction } from "@/shared/table/tableAction";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";

interface ProductStockDialogProps {
  product: Product;
  onClose: () => void;
  onChanged: () => void;
}

// A manual change only ADDS; a wrong entry is fixed on itself — see gotcha #94.
export function ProductStockDialog({ product, onClose, onChanged }: ProductStockDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userName = useUserNames();
  const addStock = useProductSlice((s) => s.addStock);
  const updateStockMovement = useProductSlice((s) => s.updateStockMovement);
  const revertStockMovement = useProductSlice((s) => s.revertStockMovement);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const form = useStockEntryForm(product, currencies);
  const { editing, adding, costEffect, costCurrency } = form;
  const [onHand, setOnHand] = useState(product.stockOnHand);
  const [history, setHistory] = useState<StockMovement[]>([]);
  const recordHistory = useRecordHistoryAction("stock_movements");

  const loadHistory = useCallback(
    () =>
      productService.getMovements(product.id).then(setHistory, () => setHistory([])),
    [product.id],
  );

  useEffect(() => {
    clearError();
    void loadHistory();
    return clearError;
  }, [clearError, loadHistory]);

  const projected = form.projectedStock(onHand);

  const applySaved = (next: number) => {
    setOnHand(next);
    onChanged();
  };

  const startEdit = (movement: StockMovement) => {
    form.startEdit(movement);
    clearError();
  };

  const confirmRevert = (movement: StockMovement) =>
    confirm({
      title: t("products.revert_stock_title"),
      message: t("products.revert_stock_message", { entry: stockEntryLabel(t, movement) }),
      confirmLabel: t("products.revert_stock_confirm"),
      destructive: true,
      onConfirm: async () => {
        const next = await revertStockMovement(movement.id, user?.id ?? null);
        if (next === null) return;
        applySaved(next);
        if (editing?.id === movement.id) form.reset();
        await loadHistory();
      },
    });

  const entryActions = (movement: StockMovement): TableAction[] => {
    const historyAction = recordHistory.action(movement.id, product.name);
    if (movement.voidedAt) return [historyAction];
    return [
      {
        key: "edit",
        group: "manage",
        label: t("products.edit_stock_entry"),
        icon: EditOutlined,
        onClick: () => startEdit(movement),
      },
      historyAction,
      {
        key: "revert",
        group: "danger",
        label: t("products.revert_stock_entry"),
        icon: UndoOutlined,
        destructive: true,
        onClick: () => void confirmRevert(movement),
      },
    ];
  };

  const submit = async () => {
    if (!user) return;
    const cost = { unitCost: form.unitCost, currency: costCurrency };
    if (editing) {
      const next = await updateStockMovement(editing.id, {
        quantity: form.parsed,
        note: form.note,
        cost,
      });
      if (next === null) return;
      applySaved(next);
      form.reset();
      await loadHistory();
      return;
    }
    const next = await addStock(product.id, user.tenantId, form.parsed, form.note, user.id, cost);
    if (next === null) return;
    onChanged();
    onClose();
  };

  return (
    <FormDialog
      open
      title={t("products.adjust_stock_title")}
      onClose={onClose}
      onSubmit={submit}
      dirty={form.dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={t(editing ? "products.save_stock_changes" : "products.save_stock")}
      maxWidth="md"
    >
      <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {product.name}
        </Typography>
        <Typography
          variant="h4"
          component="p"
          sx={{ fontWeight: 700 }}
          color={onHand > 0 ? "text.primary" : "error"}
        >
          {onHand}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("products.stock_on_hand")}
        </Typography>
      </Paper>
      {editing ? (
        <Alert severity="info" onClose={form.reset}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("products.editing_entry")}
          </Typography>
          <Typography variant="body2">
            {`${t(`products.stock_reason_${editing.reason}`)} · ${signedQuantity(
              editing.quantityDelta,
            )} · ${formatDateTime(editing.occurredAt)}`}
          </Typography>
          <Typography variant="caption">{t("products.editing_entry_hint")}</Typography>
        </Alert>
      ) : null}
      <TextField
        label={t("products.stock_quantity_label")}
        value={form.quantity}
        onChange={(event) => form.changeQuantity(digitsOnly(event.target.value))}
        placeholder="0"
        required
        autoFocus
        fullWidth
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
      />
      <Stack spacing={1}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <CurrencyInput
            label={t("products.cost_per_unit_label")}
            amount={form.unitCost}
            currencyId={form.costCurrencyId}
            onChange={form.changeUnitCost}
            currencies={currencies}
          />
          <CurrencyInput
            label={t("products.total_cost_label")}
            amount={form.totalCost}
            currencyId={form.costCurrencyId}
            onChange={form.changeTotalCost}
            currencies={currencies}
            lockCurrency
          />
        </Stack>
        {costEffect != null ? (
          <Typography variant="body2" color={adding ? "warning.dark" : "success.dark"}>
            {t(adding ? "products.total_cost_adds_note" : "products.total_cost_back_note", {
              amount: formatMoney(costEffect, costCurrency, costCurrency),
            })}
          </Typography>
        ) : null}
      </Stack>
      <TextField
        label={t("products.stock_note_label")}
        value={form.note}
        onChange={(event) => form.setNote(event.target.value)}
        placeholder={t("products.stock_note_placeholder")}
        fullWidth
      />
      {projected != null && projected < 0 ? (
        <Alert severity="warning">{t("products.stock_goes_negative", { value: projected })}</Alert>
      ) : null}
      <Box>
        <Stack
          direction="row"
          sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1 }}
        >
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
            {t("products.stock_history")}
          </Typography>
          {history.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("products.stock_history_count", { count: history.length })}
            </Typography>
          ) : null}
        </Stack>
        {history.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {t("products.stock_history_empty")}
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {history.map((movement) => (
                <StockEntryRow
                  key={movement.id}
                  movement={movement}
                  highlighted={editing?.id === movement.id}
                  byName={userName(movement.recordedByUserId)}
                  actions={movement.reason === "sale" ? [] : entryActions(movement)}
                />
              ))}
            </List>
          </Paper>
        )}
      </Box>
      {recordHistory.dialog}
    </FormDialog>
  );
}

interface StockEntryRowProps {
  movement: StockMovement;
  highlighted: boolean;
  byName: string | null;
  actions: TableAction[];
}

function StockEntryRow({ movement, highlighted, byName, actions }: StockEntryRowProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const added = movement.quantityDelta > 0;
  const voided = movement.voidedAt !== null;
  const currency = findCurrency(currencies, movement.currencyId);
  const reason = t(`products.stock_reason_${movement.reason}`);
  const quantityColor = voided ? "text.disabled" : added ? "success.main" : "error.main";

  return (
    <ListItem
      divider
      sx={{ alignItems: "flex-start", bgcolor: highlighted ? "action.selected" : undefined }}
      secondaryAction={
        <RowActionsMenu rowLabel={`${reason} ${signedQuantity(movement.quantityDelta)}`} actions={actions} />
      }
    >
      <Stack sx={{ flexGrow: 1, pr: 6, minWidth: 0 }} spacing={0.25}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, textDecoration: voided ? "line-through" : undefined }}
            color={voided ? "text.disabled" : "text.primary"}
          >
            {reason}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, textDecoration: voided ? "line-through" : undefined }}
            color={quantityColor}
          >
            {signedQuantity(movement.quantityDelta)}
          </Typography>
          {voided ? <StatusChip label={t("products.stock_reversed")} tone="gray" /> : null}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {[formatDateTime(movement.occurredAt), byName].filter(Boolean).join(" · ")}
        </Typography>
        {movement.unitCost != null && !voided ? (
          <Typography variant="caption" color={added ? "text.secondary" : "success.dark"}>
            {t(added ? "products.stock_cost_line" : "products.stock_cost_back_line", {
              amount: formatMoney(
                Math.abs(movement.quantityDelta * movement.unitCost),
                currency,
                currency,
              ),
            })}
          </Typography>
        ) : null}
        {movement.note ? (
          <Typography variant="caption" color="text.secondary">
            {movement.note}
          </Typography>
        ) : null}
      </Stack>
    </ListItem>
  );
}
