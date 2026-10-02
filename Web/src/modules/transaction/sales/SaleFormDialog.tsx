import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import type { Customer, Sale } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useSaleForm } from "@shared/modules/transaction/sales/hooks/useSaleForm";
import { FormDialog } from "@/shared/components/FormDialog";
import { CustomerFormDialog } from "@/modules/customer/customers/CustomerFormDialog";
import { CustomerPicker } from "@/modules/customer/customers/CustomerPicker";
import { useSendSalesInvoice } from "@/modules/invoicing/useSendSalesInvoice";
import { AmountCollectedField } from "@/modules/ledger/collect/AmountCollectedField";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { reloadProductsTableIfLoaded } from "@/state/productsTable";
import { SaleItemsEditor } from "./SaleItemsEditor";

interface SaleFormDialogProps {
  sale: Sale | null;
  initialCustomer?: Customer | null;
  onClose: () => void;
  onSaved: (sale: Sale, created: boolean) => void;
}

// Record or correct a sale on the phone's own rules (Shared useSaleForm).
export function SaleFormDialog({ sale, initialCustomer = null, onClose, onSaved }: SaleFormDialogProps) {
  const { t } = useTranslation();
  const sendInvoice = useSendSalesInvoice();
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const form = useSaleForm({
    sale,
    initialCustomer,
    onSaved: async (saved, send) => {
      reloadProductsTableIfLoaded();
      if (send) await sendInvoice([saved]);
      onSaved(saved, sale === null);
    },
  });
  const { cart, customer, editing } = form;
  const saleTotal = form.total ?? 0;
  const sendable = whatsAppChatUrl(customer?.phoneNumber ?? null) !== null;
  const newCustomerLabel = t("web.sales.new_customer");

  return (
    <FormDialog
      open
      title={editing ? t("sales.edit_title") : t("web.sales.record")}
      onClose={onClose}
      onSubmit={() => form.save(false)}
      dirty={form.dirty}
      error={form.error}
      onDismissError={form.clearError}
      submitLabel={editing ? t("common.save_changes") : t("web.sales.record")}
      submitDisabled={!form.canSave}
      secondarySubmit={
        sendable ? { label: t("invoice.save_and_send_whatsapp"), onSubmit: () => form.save(true) } : undefined
      }
      maxWidth="md"
    >
      {form.customerLocked ? (
        <TextField
          label={t("sales.customer_label")}
          value={customer?.name ?? ""}
          slotProps={{ input: { readOnly: true } }}
        />
      ) : (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <CustomerPicker
              label={t("sales.customer_label")}
              value={customer}
              onChange={form.setCustomer}
              placeholder={t("sales.walk_in")}
            />
          </Box>
          <Tooltip title={newCustomerLabel}>
            <IconButton aria-label={newCustomerLabel} onClick={() => setAddCustomerOpen(true)} sx={{ mt: 1 }}>
              <PersonAddOutlined />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      <SaleItemsEditor cart={cart} />

      <CurrencyInput
        label={t("sales.total_label_editable")}
        amount={form.total}
        currencyId={cart.currencyId}
        onChange={(next) => form.setTotal(next.amount)}
        currencies={cart.currencies}
        lockCurrency
        required
        helperText={
          form.totalDiffers
            ? t("sales.total_differs_hint", { calculated: form.money(form.lineSum) })
            : t("sales.total_hint")
        }
      />

      {customer ? (
        <AmountCollectedField
          mode={form.paymentMode}
          onModeChange={form.setPaymentMode}
          amount={form.amountPaid}
          onAmountChange={form.setAmountPaid}
          due={saleTotal}
          currencyId={cart.currencyId}
          currencies={cart.currencies}
          money={form.money}
          caption={
            editing
              ? t("sales.collected_total_label", {
                  amount: formatMoney(form.collectedOnSale, form.collectedCurrency, form.collectedCurrency),
                })
              : undefined
          }
        />
      ) : null}

      <TextField
        label={t("sales.notes_label")}
        value={form.notes}
        onChange={(event) => form.setNotes(event.target.value)}
        placeholder={t("sales.notes_placeholder")}
        multiline
        minRows={2}
      />

      {addCustomerOpen ? (
        <CustomerFormDialog
          customer={null}
          onClose={() => setAddCustomerOpen(false)}
          onSaved={(saved) => {
            form.setCustomer(saved);
            setAddCustomerOpen(false);
          }}
        />
      ) : null}
    </FormDialog>
  );
}
