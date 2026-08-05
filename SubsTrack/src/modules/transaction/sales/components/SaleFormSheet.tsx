import { useEffect, useState } from "react";
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
import { PaymentAmountPaidSection } from "@/src/modules/customer/customer-payments";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import type { Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { formatMoney } from "@/src/core/utils/currency";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { SaleItemsEditor, type SaleCartDraft } from "./SaleItemsEditor";

const EMPTY_CART: SaleCartDraft = {
  lines: [],
  total: 0,
  currency: null,
  currencyId: null,
  ready: false,
};

interface Props {
  // Optional pre-selected customer (used when launched from CustomerDetailScreen).
  // Walk-in flow leaves this null.
  initialCustomer?: Customer | null;
  onDismiss: () => void;
  onCreated?: () => void;
}

export function SaleFormSheet({
  initialCustomer,
  onDismiss,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createSale = useSaleSlice((s) => s.createSale);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);
  const { sendSaleInvoice } = useSendInvoice();

  const [cart, setCart] = useState<SaleCartDraft>(EMPTY_CART);
  // Which button is mid-submit — set before the write, so the spinner stays on
  // the button the user actually pressed for the whole save + send.
  const [busyOn, setBusyOn] = useState<"save" | "send" | null>(null);
  const busy = busyOn !== null;
  const [customer, setCustomer] = useState<Customer | null>(
    initialCustomer ?? null,
  );
  const [paymentMode, setPaymentMode] = useState<"full" | "partial" | "debt">(
    "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  // Cart VALUES, not the `cart` object: SaleItemsEditor re-reports the draft from
  // an effect (on mount, and again when the products list loads), so the object
  // identity changes with no user action and would mark the form dirty on open.
  // Its currency is excluded for the same reason — it self-seeds from the
  // last-used one; only actual cart lines mean the user built something.
  const dirty = useDirtyForm({
    cartLines: cart.lines.length,
    cartTotal: cart.total,
    customerId: customer?.id ?? null,
    paymentMode,
    amountPaid,
    notes,
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  const total = cart.total;
  const hasCustomer = customer != null;

  // Resolve the collected amount: full = the whole total; partial = what was
  // typed. Only a sale with a customer can be partial (a debt needs a debtor).
  const resolvedAmountPaid =
    hasCustomer && paymentMode === "debt"
      ? 0
      : paymentMode === "partial" && hasCustomer
        ? (amountPaid ?? 0)
        : total;

  async function handleSubmit(send = false) {
    if (!user || !cart.ready || busy) return;
    setBusyOn(send ? "send" : "save");
    try {
      await submit(send);
    } finally {
      setBusyOn(null);
    }
  }

  async function submit(send: boolean) {
    if (!user) return;
    const branchId = customer?.branchId ?? user.branchId ?? null;
    const sale = await createSale({
      items: cart.lines,
      customerId: customer?.id ?? null,
      branchId,
      amountPaid: resolvedAmountPaid,
      currency: cart.currency,
      recordedByUserId: user.id,
      tenantId: user.tenantId,
      notes: notes.trim() || null,
    });
    if (sale) {
      // The form's own `customer` is the recipient, not `sale.customer` — the
      // send must not depend on the write's join.
      if (send && customer) {
        await sendSaleInvoice({
          phone: customer.phoneNumber,
          customerName: customer.name,
          sale,
        });
      }
      onCreated?.();
      onDismiss();
    }
  }

  // Validity only — the busy state is gated per button, so the pressed one keeps
  // its own spinner instead of both greying out.
  const submitDisabled =
    !cart.ready ||
    (paymentMode === "partial" &&
      hasCustomer &&
      (amountPaid == null || amountPaid < 0 || amountPaid > total));

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
        dirty={dirty}
        title={t("sales.record_title")}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {!initialCustomer ? (
          <CustomerPicker
            label={t("sales.customer_label")}
            placeholder={t("sales.walk_in")}
            value={customer}
            onChange={setCustomer}
            nullable
            nullLabel={t("sales.walk_in")}
            onAddNew={() => setAddCustomerOpen(true)}
          />
        ) : (
          <View className="mb-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
            <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t("sales.customer_label")}
            </Text>
            <Text className="text-base text-gray-900 font-medium">
              {customer?.name}
            </Text>
          </View>
        )}

        {/* Multi-product cart (one currency, per-line qty + unit price). */}
        <SaleItemsEditor onChange={setCart} onFocusClearError={clearError} />

        {/* Sale total */}
        {total > 0 ? (
          <View className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-50 flex-row items-center justify-between">
            <Text className="text-sm text-emerald-700 font-medium">
              {t("sales.total_label")}
            </Text>
            <Text className="text-base text-emerald-700 font-bold">
              {formatMoney(total, cart.currency, cart.currency)}
            </Text>
          </View>
        ) : null}

        {/* Full / partial / debt collection. Partial and debt both leave a
            "Sales" debt on the customer, so they're only offered when a
            customer is selected. */}
        {hasCustomer ? (
          <PaymentAmountPaidSection
            paymentMode={paymentMode}
            onPaymentModeChange={setPaymentMode}
            amountPaid={amountPaid}
            onAmountPaidChange={setAmountPaid}
            currencyId={cart.currencyId}
            amountDue={total > 0 ? total : null}
            formatAmount={(a) => formatMoney(a, cart.currency, cart.currency)}
            onFocusClearError={clearError}
            partialDisabled={total <= 0}
            allowDebt
          />
        ) : null}

        <Input
          label={t("sales.notes_label")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("sales.notes_placeholder")}
          multiline
        />

        <Button
          label={t("sales.record_button")}
          onPress={() => void handleSubmit(false)}
          loading={busyOn === "save"}
          disabled={submitDisabled || busyOn === "send"}
          fullWidth
        />
        <SendOnWhatsAppButton
          // A walk-in has nobody to send to — say that instead of "no phone".
          phone={hasCustomer ? customer?.phoneNumber : null}
          reason={hasCustomer ? undefined : t("invoice.no_customer")}
          label={t("invoice.save_and_send_whatsapp")}
          onPress={() => void handleSubmit(true)}
          loading={busyOn === "send"}
          disabled={submitDisabled || busyOn === "save"}
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
