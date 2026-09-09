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
    sale ? "debt" : "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
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
  const owing = Math.max(0, saleTotal - collectedOnSale);

  const resolvedAmountPaid = !hasCustomer
    ?
      owing
    : paymentMode === "debt"
      ? 0
      : paymentMode === "partial"
        ? (amountPaid ?? 0)
        : owing;

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

  async function handleSubmit(send = false) {
    if (!user || !cart.ready || busy) return;
    if (!(await confirmedTotal())) return;
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
          collectNow: resolvedAmountPaid,
        })
      : await createSale({
          ...common,
          amountPaid: resolvedAmountPaid,
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
    (editing && saleTotal + 1e-9 < collectedOnSale) ||
    (paymentMode === "partial" &&
      hasCustomer &&
      (amountPaid == null || amountPaid < 0 || amountPaid > owing));

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

        {/* Items cart: product and/or service lines, one sale currency. */}
        <SaleItemsEditor
          onChange={setCart}
          onFocusClearError={clearError}
          initial={initialCart}
          currencyLocked={collectedOnSale > 0}
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

        {/* Already collected — read-only, because a hand-over is a physical
            event with its own date and collector. Undoing one is a void, in the
            bill sheet that owns it. */}
        {editing && collectedOnSale > 0 ? (
          <View className="mb-4 px-4 py-2.5 rounded-xl bg-gray-50 flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">{t("sales.paid_label")}</Text>
            <Text fontWeight="Medium" className="text-sm text-gray-900">
              {formatMoney(collectedOnSale, cart.currency, cart.currency)}
            </Text>
          </View>
        ) : null}

        {/* Cash taken by THIS save: all of what is owed, part of it, or nothing.
            Partial and "pay later" both leave a "Sales" debt on the customer, so
            they're only offered when a customer is selected. On an edit the
            money is strictly additive and the heading says so. */}
        {hasCustomer && (!editing || owing > 0) ? (
          <>
            {editing ? (
              <Text
                fontWeight="SemiBold"
                className="mb-2 text-xs uppercase tracking-wide text-gray-500"
              >
                {t("sales.collect_now_label", {
                  amount: formatMoney(owing, cart.currency, cart.currency),
                })}
              </Text>
            ) : null}
            <AmountCollectedSection
              paymentMode={paymentMode}
              onPaymentModeChange={setPaymentMode}
              amountPaid={amountPaid}
              onAmountPaidChange={setAmountPaid}
              currencyId={cart.currencyId}
              amountDue={owing > 0 ? owing : null}
              formatAmount={(a: number) => formatMoney(a, cart.currency, cart.currency)}
              onFocusClearError={clearError}
              partialDisabled={owing <= 0}
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
