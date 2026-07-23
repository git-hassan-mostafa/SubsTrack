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
import type { Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { formatMoney } from "@/src/core/utils/currency";
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
  const loading = useSaleSlice((s) => s.loading);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);

  const [cart, setCart] = useState<SaleCartDraft>(EMPTY_CART);
  const [customer, setCustomer] = useState<Customer | null>(
    initialCustomer ?? null,
  );
  const [paymentMode, setPaymentMode] = useState<"full" | "partial" | "debt">(
    "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleSubmit() {
    if (!user || !cart.ready) return;
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
      onCreated?.();
      onDismiss();
    }
  }

  const submitDisabled =
    !cart.ready ||
    (paymentMode === "partial" &&
      hasCustomer &&
      (amountPaid == null || amountPaid < 0 || amountPaid > total)) ||
    loading;

  return (
    <>
      <FormSheet onDismiss={onDismiss} title={t("sales.record_title")}>
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
          onPress={handleSubmit}
          loading={loading}
          disabled={submitDisabled}
          fullWidth
        />

        <View className="h-24" />
      </FormSheet>

      {addCustomerOpen && (
        <CustomerFormSheet onDismiss={() => setAddCustomerOpen(false)} />
      )}
    </>
  );
}
