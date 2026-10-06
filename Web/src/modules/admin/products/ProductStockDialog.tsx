import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import type { GridColDef } from "@mui/x-data-grid";
import type { Product, StockMovement } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import { digitsOnly } from "@shared/core/utils/inputText";
import { useStockEntryForm } from "@shared/modules/admin/products/hooks/useStockEntryForm";
import { useStockMovements } from "@shared/modules/admin/products/hooks/useStockMovements";
import {
  signedQuantity,
  stockEntryActions,
  stockEntryCost,
  stockEntryLabel,
  type StockEntryActionKey,
} from "@shared/modules/admin/products/utils/stockText";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { PAGE_SIZE_OPTIONS } from "@/state/createPagedStore";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { useHistoryDoor } from "@/modules/admin/audit/useHistoryDoor";

interface ProductStockDialogProps {
  product: Product;
  onClose: () => void;
  onChanged: (onHand: number) => void;
}

const STOCK_ENTRY_ICONS: Record<StockEntryActionKey, SvgIconComponent> = {
  edit: EditOutlined,
  history: HistoryOutlined,
  revert: UndoOutlined,
};

const LONGEST_PAGE = Math.max(...PAGE_SIZE_OPTIONS);

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
  const { history, reload: loadHistory } = useStockMovements(product.id);
  const recordHistory = useHistoryDoor("stock_movements");

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const projected = form.projectedStock(onHand);

  const applySaved = (next: number) => {
    setOnHand(next);
    onChanged(next);
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

  const entryActions = (movement: StockMovement): TableAction[] =>
    toTableActions(stockEntryActions(movement), t, {
      icons: STOCK_ENTRY_ICONS,
      run: {
        edit: () => startEdit(movement),
        history: () => recordHistory.open(movement.id, product.name),
        revert: () => void confirmRevert(movement),
      },
    });


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
    onChanged(next);
    onClose();
  };

  const columns: GridColDef<StockMovement>[] = [
    {
      field: "occurredAt",
      headerName: t("web.products.history_date"),
      width: 160,
      valueGetter: (_value, row) => formatDateTime(row.occurredAt),
    },
    {
      field: "reason",
      headerName: t("web.products.history_type"),
      width: 190,
      renderCell: (params) => <EntryTypeCell movement={params.row} />,
    },
    {
      field: "quantityDelta",
      headerName: t("products.stock_quantity_label"),
      width: 100,
      renderCell: (params) => <QuantityCell movement={params.row} />,
    },
    {
      field: "unitCost",
      headerName: t("web.products.cost"),
      width: 180,
      renderCell: (params) => <CostCell movement={params.row} />,
    },
    {
      field: "note",
      headerName: t("products.stock_note_label"),
      flex: 1,
      minWidth: 160,
    },
    {
      field: "recordedByUserId",
      headerName: t("web.products.history_by"),
      width: 140,
      valueGetter: (_value, row) => userName(row.recordedByUserId) ?? "",
    },
  ];

  return (
    <FormDialog
      open
      title={t("products.adjust_stock_title")}
      subtitle={product.name}
      onClose={onClose}
      onSubmit={submit}
      dirty={form.dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={t(editing ? "products.save_stock_changes" : "products.save_stock")}
      maxWidth="lg"
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography color="text.secondary">{t("products.stock_on_hand")}</Typography>
        <Typography
          variant="h6"
          component="p"
          sx={{ fontWeight: 700 }}
          color={onHand > 0 ? "text.primary" : "error"}
        >
          {onHand}
        </Typography>
      </Stack>
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
      <Stack spacing={1}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "140px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr)",
            },
            gap: 2,
            alignItems: "start",
          }}
        >
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
          <TextField
            label={t("products.stock_note_label")}
            value={form.note}
            onChange={(event) => form.setNote(event.target.value)}
            placeholder={t("products.stock_note_placeholder")}
            fullWidth
          />
        </Box>
        {costEffect != null ? (
          <Typography variant="body2" color={adding ? "warning.dark" : "success.dark"}>
            {t(adding ? "products.total_cost_adds_note" : "products.total_cost_back_note", {
              amount: formatMoney(costEffect, costCurrency, costCurrency),
            })}
          </Typography>
        ) : null}
      </Stack>
      {projected != null && projected < 0 ? (
        <Alert severity="warning">{t("products.stock_goes_negative", { value: projected })}</Alert>
      ) : null}
      <Stack spacing={1}>
        <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
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
          <LocalTable<StockMovement>
            label={t("products.stock_history")}
            columns={columns}
            rows={history}
            pageSize={LONGEST_PAGE}
            rowLabel={(movement) =>
              `${t(`products.stock_reason_${movement.reason}`)} ${signedQuantity(movement.quantityDelta)}`
            }
            rowActions={entryActions}
            rowTone={(movement) =>
              editing?.id === movement.id ? "highlighted" : movement.voidedAt ? "muted" : null
            }
          />
        )}
      </Stack>
      {recordHistory.dialog}
    </FormDialog>
  );
}

function EntryTypeCell({ movement }: { movement: StockMovement }) {
  const { t } = useTranslation();
  const voided = movement.voidedAt !== null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", height: "100%" }}>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, textDecoration: voided ? "line-through" : undefined }}
        color={voided ? "text.disabled" : "text.primary"}
      >
        {t(`products.stock_reason_${movement.reason}`)}
      </Typography>
      {voided ? <StatusChip label={t("products.stock_reversed")} tone="gray" /> : null}
    </Stack>
  );
}

function QuantityCell({ movement }: { movement: StockMovement }) {
  const voided = movement.voidedAt !== null;
  const added = movement.quantityDelta > 0;
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{ fontWeight: 700, textDecoration: voided ? "line-through" : undefined }}
      color={voided ? "text.disabled" : added ? "success.main" : "error.main"}
    >
      {signedQuantity(movement.quantityDelta)}
    </Typography>
  );
}

function CostCell({ movement }: { movement: StockMovement }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const cost = stockEntryCost(movement, currencies);
  if (!cost) return null;
  if (!cost.refund) return <>{cost.amount}</>;
  return (
    <Typography variant="body2" component="span" color="success.dark">
      {t("products.stock_cost_back_line", { amount: cost.amount })}
    </Typography>
  );
}

