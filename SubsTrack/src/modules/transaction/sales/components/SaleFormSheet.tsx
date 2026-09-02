import { useEffect, useMemo, useState } from "react";
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
import type { Customer, Sale } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { formatMoney } from "@/src/core/utils/currency";
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

// How much of a NEW sale is being collected at the till. An edit never shows
// this: money is a `collections` row of its own now, so correcting a sale
// re-prices the bill and leaves every payment against it exactly as recorded.

interface Props {
  // Optional pre-selected customer (used when launched from CustomerDetailScreen).
  // Walk-in flow leaves this null.
  initialCustomer?: Customer | null;
  // Edit mode: the saved sale being corrected. Everything the form owns can
  // change; a voided sale is never passed here.
  sale?: Sale | null;
  onDismiss: () => void;
  // Both carry the saved row: a list that keeps its own state patches itself
  // with it instead of re-reading the table (the global slice already has).
  onCreated?: (sale: Sale) => void;
  onUpdated?: (sale: Sale) => void;
}

export function SaleFormSheet({
  initialCustomer,
  sale = null,
  onDismiss,
  onCreated,
  onUpdated,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createSale = useSaleSlice((s) => s.createSale);
  const updateSale = useSaleSlice((s) => s.updateSale);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);
  const { sendSaleInvoice } = useSendInvoice();
  const editing = sale != null;

  const [cart, setCart] = useState<SaleCartDraft>(EMPTY_CART);
  // Which button is mid-submit — set before the write, so the spinner stays on
  // the button the user actually pressed for the whole save + send.
  const [busyOn, setBusyOn] = useState<"save" | "send" | null>(null);
  const busy = busyOn !== null;
  const [customer, setCustomer] = useState<Customer | null>(
    sale?.customer ?? initialCustomer ?? null,
  );
  // On an EDIT this is about extra cash handed over now, so it starts at
  // "nothing" — most edits only fix the cart or a typo.
  const [paymentMode, setPaymentMode] = useState<"full" | "partial" | "debt">(
    sale ? "debt" : "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  // Seeds the cart in edit mode. Memoized: SaleItemsEditor derives its stock
  // credit from it, and that feeds an effect's dependencies.
  const initialCart: SaleEditorInitial | null = useMemo(
    () =>
      sale
        ? {
            items: sale.items.map((it) => ({
              lineType: it.lineType,
              productId: it.productId,
              serviceId: it.serviceId,
              // The frozen name — the only record of a one-off service line.
              name: it.itemNameSnapshot,
              quantity: it.quantity,
              unitAmount: it.unitAmount,
            })),
            currencyId: sale.currencyId,
          }
        : null,
    [sale],
  );

  // The cart reports its OWN dirtiness (it re-reports the draft from an effect,
  // so its values arrive a render after this baseline is taken — see
  // SaleCartDraft.dirty). Everything else here is plain user input.
  const dirty = useDirtyForm({
    cartDirty: cart.dirty,
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

  // Already collected on the sale being edited. Read-only: a recorded hand-over
  // is a physical event with its own date and collector, so the form can only
  // ADD to it — undoing one is a void, in the sheet that owns it.
  const collectedOnSale = sale?.amountPaid ?? 0;
  // What the customer still owes after any re-pricing — the ceiling on both the
  // "collect now" field and the till amount.
  const owing = Math.max(0, total - collectedOnSale);

  // How much cash is being taken by THIS save: on a new sale the whole total,
  // part of it, or nothing; on an edit the same three, against what is still
  // owed. Only a sale with a customer can be left owing (a debt needs a debtor).
  const resolvedAmountPaid = !hasCustomer
    ? // A walk-in has nobody to chase, so it is always paid in full — which on
      // an edit means only the gap a re-pricing just opened.
      owing
    : paymentMode === "debt"
      ? 0
      : paymentMode === "partial"
        ? (amountPaid ?? 0)
        : owing;

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
    // A customer-bound sale sits in the customer's branch. Otherwise an EDIT
    // keeps the branch the sale already had — falling back to the editor's own
    // branch would move a collector's walk-in sale out of its branch the moment
    // a tenant-wide admin (branchId null) corrected a typo in it.
    const branchId =
      customer?.branchId ?? (sale ? sale.branchId : (user.branchId ?? null));
    const common = {
      items: cart.lines,
      customerId: customer?.id ?? null,
      branchId,
      currency: cart.currency,
      notes: notes.trim() || null,
    };
    const saved = sale
      ? // An edit re-prices the BILL. Its only money field is additive: cash
        // handed over right now becomes a new payment, dated today, and every
        // payment already recorded is left exactly as it was.
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
      // The form's own `customer` is the recipient, not `saved.customer` — the
      // send must not depend on the write's join.
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

  // Validity only — the busy state is gated per button, so the pressed one keeps
  // its own spinner instead of both greying out.
  const submitDisabled =
    !cart.ready ||
    // Re-pricing may not drop the total below what has already been collected —
    // the service refuses it, so say so before the button is pressed.
    (editing && total + 1e-9 < collectedOnSale) ||
    // A typed amount must fit inside what is still owed (on a new sale that is
    // the whole total).
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
            <Text className="text-base text-gray-900 font-medium">
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

        {/* Already collected — read-only, because a hand-over is a physical
            event with its own date and collector. Undoing one is a void, in the
            bill sheet that owns it. */}
        {editing && collectedOnSale > 0 ? (
          <View className="mb-4 px-4 py-2.5 rounded-xl bg-gray-50 flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">{t("sales.paid_label")}</Text>
            <Text className="text-sm text-gray-900 font-medium">
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
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
