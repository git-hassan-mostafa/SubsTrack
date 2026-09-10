import { useEffect, useMemo, useRef, useState } from "react";
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
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import type { Customer, Sale } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { formatMoney } from "@/src/core/utils/currency";
import { confirm } from "@/src/shared/lib/confirm";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import {
  SaleItemsEditor,
  type SaleCartDraft,
  type SaleEditorInitial,
} from "./SaleItemsEditor";

const EMPTY_CART: SaleCartDraft = {
  lines: [],
  total: 0,
  currency: null,
  currencyId: null,
  ready: false,
  dirty: false,
};

// An edit opens on what the sale ALREADY collected, so saving changes nothing.
function initialPaymentMode(sale: Sale): "full" | "partial" | "debt" {
  if (sale.amountPaid <= 0) return "debt";
  return sale.amountPaid + 1e-9 >= sale.totalAmount ? "full" : "partial";
}


interface Props {
  initialCustomer?: Customer | null;
  sale?: Sale | null;
  onDismiss: () => void;
  onCreated?: (sale: Sale) => void;
  onUpdated?: (sale: Sale) => void;
}

// Total is typed and re-seeded from the lines on every change — see gotcha #142.
export function SaleFormSheet({
  initialCustomer,
  sale = null,
  onDismiss,
  onCreated,
  onUpdated,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const createSale = useSaleSlice((s) => s.createSale);
  const updateSale = useSaleSlice((s) => s.updateSale);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);
  const { sendSaleInvoice } = useSendInvoice();
  const editing = sale != null;

  const [cart, setCart] = useState<SaleCartDraft>(EMPTY_CART);
  const [total, setTotal] = useState<number | null>(sale?.totalAmount ?? null);
  const [busyOn, setBusyOn] = useState<"save" | "send" | null>(null);
  const busy = busyOn !== null;
  const [customer, setCustomer] = useState<Customer | null>(
    sale?.customer ?? initialCustomer ?? null,
  );
  const [paymentMode, setPaymentMode] = useState<"full" | "partial" | "debt">(
    sale ? initialPaymentMode(sale) : "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(
    sale ? sale.amountPaid : null,
  );
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const initialCart: SaleEditorInitial | null = useMemo(
    () =>
      sale
        ? {
            items: sale.items.map((it) => ({
              lineType: it.lineType,
              productId: it.productId,
              serviceId: it.serviceId,
              name: it.itemNameSnapshot,
              quantity: it.quantity,
              unitAmount: it.unitAmount,
            })),
            currencyId: sale.currencyId,
          }
        : null,
    [sale],
  );

  const dirty = useDirtyForm({
    cartDirty: cart.dirty,
    customerId: customer?.id ?? null,
    paymentMode,
    amountPaid,
    total,
    notes,
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  const lineSum = cart.total;
  const lineCount = cart.lines.length;

  const seeded = useRef(!editing);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    if (lineCount === 0) return;
    setTotal(lineSum);
  }, [lineSum, lineCount]);

  const hasCustomer = customer != null;

  const saleTotal = total ?? 0;
  const collectedOnSale = sale?.amountPaid ?? 0;
  const saleCurrency =
    currencies.find((c) => c.id === sale?.currencyId) ?? cart.currency;

  const resolvedCollected = !hasCustomer
    ? saleTotal
    : paymentMode === "debt"
      ? 0
      : paymentMode === "partial"
        ? Math.min(amountPaid ?? 0, saleTotal)
        : saleTotal;
  const rebuildsCash =
    collectedOnSale > 0 &&
    (resolvedCollected + 1e-9 < collectedOnSale ||
      (cart.currencyId ?? null) !== (sale?.currencyId ?? null));

  // Only the person saving can tell a deliberate discount from a fat finger.
  async function confirmedTotal(): Promise<boolean> {
    const money = (a: number) => formatMoney(a, cart.currency, cart.currency);
    if (lineCount === 0) {
      return confirm({
        title: t("sales.confirm_no_items_title"),
        message: t("sales.confirm_no_items_message", { typed: money(saleTotal) }),
        confirmLabel: t("common.save"),
      });
    }
    if (Math.abs(saleTotal - lineSum) < 1e-9) return true;
    return confirm({
      title: t("sales.confirm_manual_total_title"),
      message: t("sales.confirm_manual_total_message", {
        calculated: money(lineSum),
        typed: money(saleTotal),
      }),
      confirmLabel: t("common.save"),
    });
  }

  // Cash already handed over is about to be cancelled and re-recorded (#111).
  async function confirmedCashRebuild(): Promise<boolean> {
    if (!rebuildsCash) return true;
    const money = (a: number) => formatMoney(a, cart.currency, cart.currency);
    return confirm({
      title: t("sales.confirm_rebuild_cash_title"),
      message: t("sales.confirm_rebuild_cash_message", {
        collected: formatMoney(collectedOnSale, saleCurrency, saleCurrency),
        replacement: money(resolvedCollected),
      }),
      confirmLabel: t("common.save"),
      destructive: true,
    });
  }

  async function handleSubmit(send = false) {
    if (!user || !cart.ready || busy) return;
    if (!(await confirmedTotal())) return;
    if (!(await confirmedCashRebuild())) return;
    setBusyOn(send ? "send" : "save");
    try {
      await submit(send);
    } finally {
      setBusyOn(null);
    }
  }

  async function submit(send: boolean) {
    if (!user) return;
    const branchId =
      customer?.branchId ?? (sale ? sale.branchId : (user.branchId ?? null));
    const common = {
      items: cart.lines,
      totalAmount: saleTotal,
      customerId: customer?.id ?? null,
      branchId,
      currency: cart.currency,
      notes: notes.trim() || null,
    };
    const saved = sale
      ?
        await updateSale(sale, {
          ...common,
          actorUserId: user.id,
          collectedTotal: resolvedCollected,
        })
      : await createSale({
          ...common,
          amountPaid: resolvedCollected,
          recordedByUserId: user.id,
          tenantId: user.tenantId,
        });
    if (saved) {
      if (send && customer) {
        await sendSaleInvoice({
          phone: customer.phoneNumber,
          customerName: customer.name,
          sale: saved,
        });
      }
      if (sale) onUpdated?.(saved);
      else onCreated?.(saved);
      onDismiss();
    }
  }

  const submitDisabled =
    !cart.ready ||
    saleTotal <= 0 ||
    (paymentMode === "partial" &&
      hasCustomer &&
      (amountPaid == null || amountPaid < 0 || amountPaid > saleTotal));

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
        dirty={dirty}
        title={editing ? t("sales.edit_title") : t("sales.record_title")}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {/* The read-only line is for the customer screens, which record a sale
            FOR one customer. Correcting a sale may move it to another. */}
        {editing || !initialCustomer ? (
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
            <Text fontWeight="Medium" className="text-base text-gray-900">
              {customer?.name}
            </Text>
          </View>
        )}

        <SaleItemsEditor
          onChange={setCart}
          onFocusClearError={clearError}
          initial={initialCart}
        />

        <CurrencyInput
          label={t("sales.total_label_editable") + " *"}
          amount={total}
          currencyId={cart.currencyId}
          onChange={({ amount }) => setTotal(amount)}
          currencies={currencies}
          placeholder="0.00"
          lockCurrency
          onFocus={clearError}
        />
        <Text className="-mt-2 mb-4 text-xs text-gray-400">
          {lineCount > 0 && Math.abs(saleTotal - lineSum) > 1e-9
            ? t("sales.total_differs_hint", {
                calculated: formatMoney(lineSum, cart.currency, cart.currency),
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
                  amount: formatMoney(collectedOnSale, saleCurrency, saleCurrency),
                })}
              </Text>
            ) : null}
            <AmountCollectedSection
              paymentMode={paymentMode}
              onPaymentModeChange={setPaymentMode}
              amountPaid={amountPaid}
              onAmountPaidChange={setAmountPaid}
              currencyId={cart.currencyId}
              amountDue={saleTotal > 0 ? saleTotal : null}
              formatAmount={(a: number) => formatMoney(a, cart.currency, cart.currency)}
              onFocusClearError={clearError}
              partialDisabled={saleTotal <= 0}
              allowDebt
            />
          </>
        ) : null}

        <Input
          label={t("sales.notes_label")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("sales.notes_placeholder")}
          multiline
        />

        <Button
          label={editing ? t("common.save_changes") : t("sales.record_button")}
          onPress={() => void handleSubmit(false)}
          loading={busyOn === "save"}
          disabled={submitDisabled || busyOn === "send"}
          fullWidth
        />
        <SendOnWhatsAppButton
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
