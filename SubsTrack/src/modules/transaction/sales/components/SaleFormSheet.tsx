import { useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  CustomerPicker,
  CustomerFormSheet,
} from "@/src/modules/customer/customers";
import { AmountCollectedSection } from "@/src/modules/ledger";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import {
  customerRecipient,
  sendBlockedKey,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import type { Customer, Sale } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useSaleForm } from "@shared/modules/transaction/sales/hooks/useSaleForm";
import { SaleItemsEditor } from "./SaleItemsEditor";

interface Props {
  initialCustomer?: Customer | null;
  sale?: Sale | null;
  onDismiss: () => void;
  onCreated?: (sale: Sale) => void;
  onUpdated?: (sale: Sale) => void;
}

// The form rules live in Shared `useSaleForm` — see gotchas #111 and #142.
export function SaleFormSheet({
  initialCustomer,
  sale = null,
  onDismiss,
  onCreated,
  onUpdated,
}: Props) {
  const { t } = useTranslation();
  const { sendSales } = useSendInvoice();
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const form = useSaleForm({
    sale,
    initialCustomer,
    onSaved: async (saved, send) => {
      if (send) await sendSales([saved]);
      if (sale) onUpdated?.(saved);
      else onCreated?.(saved);
      onDismiss();
    },
  });
  const { cart, customer, editing, busyOn, clearError } = form;
  const hasCustomer = customer != null;
  const saleTotal = form.total ?? 0;

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
        dirty={form.dirty}
        title={editing ? t("sales.edit_title") : t("sales.record_title")}
      >
        {form.error ? (
          <ErrorBanner message={form.error} onDismiss={clearError} />
        ) : null}

        {form.customerLocked ? (
          <View className="mb-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
            <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t("sales.customer_label")}
            </Text>
            <Text fontWeight="Medium" className="text-base text-gray-900">
              {customer?.name}
            </Text>
          </View>
        ) : (
          <CustomerPicker
            label={t("sales.customer_label")}
            placeholder={t("sales.walk_in")}
            value={customer}
            onChange={form.setCustomer}
            nullable
            nullLabel={t("sales.walk_in")}
            onAddNew={() => setAddCustomerOpen(true)}
          />
        )}

        <SaleItemsEditor cart={cart} onFocusClearError={clearError} />

        <CurrencyInput
          label={t("sales.total_label_editable") + " *"}
          amount={form.total}
          currencyId={cart.currencyId}
          onChange={({ amount }) => form.setTotal(amount)}
          currencies={cart.currencies}
          placeholder="0.00"
          lockCurrency
          onFocus={clearError}
        />
        <Text className="-mt-2 mb-4 text-xs text-gray-400">
          {form.totalDiffers
            ? t("sales.total_differs_hint", {
                calculated: form.money(form.lineSum),
              })
            : t("sales.total_hint")}
        </Text>

        {hasCustomer ? (
          <>
            {editing ? (
              <Text
                fontWeight="SemiBold"
                className="mb-2 text-xs uppercase tracking-wide text-gray-500"
              >
                {t("sales.collected_total_label", {
                  amount: formatMoney(
                    form.collectedOnSale,
                    form.collectedCurrency,
                    form.collectedCurrency,
                  ),
                })}
              </Text>
            ) : null}
            <AmountCollectedSection
              paymentMode={form.paymentMode}
              onPaymentModeChange={form.setPaymentMode}
              amountPaid={form.amountPaid}
              onAmountPaidChange={form.setAmountPaid}
              currencyId={cart.currencyId}
              due={saleTotal}
              formatAmount={form.money}
              onFocusClearError={clearError}
            />
          </>
        ) : null}

        <Input
          label={t("sales.notes_label")}
          value={form.notes}
          onChangeText={form.setNotes}
          placeholder={t("sales.notes_placeholder")}
          multiline
        />

        <Button
          label={editing ? t("common.save_changes") : t("sales.record_button")}
          onPress={() => void form.save(false)}
          loading={busyOn === "save"}
          disabled={!form.canSave || busyOn === "send"}
          fullWidth
        />
        <SendOnWhatsAppButton
          blockedKey={sendBlockedKey(
            customer ? customerRecipient(customer) : null,
          )}
          label={t("invoice.save_and_send_whatsapp")}
          onPress={() => void form.save(true)}
          loading={busyOn === "send"}
          disabled={!form.canSave || busyOn === "save"}
          className="mt-2"
        />

        <View className="h-24" />
      </FormSheet>

      {addCustomerOpen && (
        <CustomerFormSheet onDismiss={() => setAddCustomerOpen(false)} />
      )}
    </>
  );
}
