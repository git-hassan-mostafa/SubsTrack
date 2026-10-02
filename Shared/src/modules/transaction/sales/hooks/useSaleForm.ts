import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Currency, Customer, Sale } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import type { PaymentMode } from "@shared/modules/ledger/utils/amountCollected";
import {
  useSaleCart,
  type SaleCart,
} from "@shared/modules/transaction/sales/hooks/useSaleCart";
import { editorInitial } from "@shared/modules/transaction/sales/utils/saleCart";
import {
  canSaveSale,
  initialPaymentMode,
  rebuildsSaleCash,
  saleBranchId,
  saleCollected,
  saleTotalCheck,
  totalDiffersFromLines,
} from "@shared/modules/transaction/sales/utils/saleForm";
import { confirm } from "@shared/shared/lib/confirm";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useSaleSlice } from "@shared/state/hooks/useSaleSlice";

export type SaleSaveKind = "save" | "send";

interface SaleFormOptions {
  sale?: Sale | null;
  initialCustomer?: Customer | null;
  onSaved: (saved: Sale, send: boolean, customer: Customer | null) => void | Promise<void>;
}

export interface SaleForm {
  editing: boolean;
  cart: SaleCart;
  customer: Customer | null;
  setCustomer: (customer: Customer | null) => void;
  customerLocked: boolean;
  total: number | null;
  setTotal: (total: number | null) => void;
  lineSum: number;
  totalDiffers: boolean;
  paymentMode: PaymentMode;
  setPaymentMode: (mode: PaymentMode) => void;
  amountPaid: number | null;
  setAmountPaid: (amount: number | null) => void;
  notes: string;
  setNotes: (notes: string) => void;
  collectedOnSale: number;
  collectedCurrency: Currency | null;
  money: (amount: number) => string;
  canSave: boolean;
  dirty: boolean;
  error: string | null;
  clearError: () => void;
  busyOn: SaleSaveKind | null;
  save: (send: boolean) => Promise<void>;
}

// The total is typed and re-seeded only when a line changes — see gotcha #142.
export function useSaleForm({
  sale = null,
  initialCustomer = null,
  onSaved,
}: SaleFormOptions): SaleForm {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const createSale = useSaleSlice((s) => s.createSale);
  const updateSale = useSaleSlice((s) => s.updateSale);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);
  const editing = sale != null;

  const initial = useMemo(() => (sale ? editorInitial(sale) : null), [sale]);
  const cart = useSaleCart(initial);
  const { draft } = cart;
  const [total, setTotal] = useState<number | null>(sale?.totalAmount ?? null);
  const [seenSignature, setSeenSignature] = useState(draft.signature);
  const [customer, setCustomer] = useState<Customer | null>(
    sale?.customer ?? initialCustomer,
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    sale ? initialPaymentMode(sale) : "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(
    sale ? sale.amountPaid : null,
  );
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [busyOn, setBusyOn] = useState<SaleSaveKind | null>(null);

  const lineSum = draft.total;
  const lineCount = draft.lines.length;
  if (seenSignature !== draft.signature) {
    setSeenSignature(draft.signature);
    if (lineCount > 0) setTotal(lineSum);
  }

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const dirty = useDirtyForm({
    cartDirty: draft.dirty,
    customerId: customer?.id ?? null,
    paymentMode,
    amountPaid,
    total,
    notes,
  });

  const hasCustomer = customer != null;
  const saleTotal = total ?? 0;
  const collectedOnSale = sale?.amountPaid ?? 0;
  const collectedCurrency =
    currencies.find((c) => c.id === sale?.currencyId) ?? draft.currency;
  const money = (amount: number) =>
    formatMoney(amount, draft.currency, draft.currency);
  const collected = saleCollected({
    hasCustomer,
    mode: paymentMode,
    typed: amountPaid,
    total: saleTotal,
  });

  const confirmedTotal = (): Promise<boolean> => {
    const check = saleTotalCheck(lineCount, lineSum, saleTotal);
    if (check === null) return Promise.resolve(true);
    return confirm({
      title: t(check === "no_items" ? "sales.confirm_no_items_title" : "sales.confirm_manual_total_title"),
      message:
        check === "no_items"
          ? t("sales.confirm_no_items_message", { typed: money(saleTotal) })
          : t("sales.confirm_manual_total_message", {
              calculated: money(lineSum),
              typed: money(saleTotal),
            }),
      confirmLabel: t("common.save"),
    });
  };

  const confirmedCashRebuild = async (run: () => Promise<void>) => {
    const rebuilds = rebuildsSaleCash(
      collectedOnSale,
      collected,
      sale?.currencyId ?? null,
      draft.currencyId,
    );
    if (!rebuilds) {
      await run();
      return;
    }
    await confirm({
      title: t("sales.confirm_rebuild_cash_title"),
      message: t("sales.confirm_rebuild_cash_message", {
        collected: formatMoney(collectedOnSale, collectedCurrency, collectedCurrency),
        replacement: money(collected),
      }),
      confirmLabel: t("common.save"),
      destructive: true,
      onConfirm: run,
    });
  };

  const write = async (): Promise<Sale | null> => {
    if (!user) return null;
    const common = {
      items: draft.lines,
      totalAmount: saleTotal,
      customerId: customer?.id ?? null,
      branchId: saleBranchId(customer, sale, user.branchId ?? null),
      currency: draft.currency,
      notes: notes.trim() || null,
    };
    return sale
      ? updateSale(sale, { ...common, actorUserId: user.id, collectedTotal: collected })
      : createSale({
          ...common,
          amountPaid: collected,
          recordedByUserId: user.id,
          tenantId: user.tenantId,
        });
  };

  const save = async (send: boolean) => {
    if (!user || !draft.ready || busyOn) return;
    if (!(await confirmedTotal())) return;
    await confirmedCashRebuild(async () => {
      setBusyOn(send ? "send" : "save");
      try {
        const saved = await write();
        if (saved) await onSaved(saved, send, customer);
      } finally {
        setBusyOn(null);
      }
    });
  };

  return {
    editing,
    cart,
    customer,
    setCustomer,
    customerLocked: !editing && initialCustomer != null,
    total,
    setTotal,
    lineSum,
    totalDiffers: totalDiffersFromLines(lineCount, lineSum, saleTotal),
    paymentMode,
    setPaymentMode,
    amountPaid,
    setAmountPaid,
    notes,
    setNotes,
    collectedOnSale,
    collectedCurrency,
    money,
    canSave: canSaveSale({
      ready: draft.ready,
      total: saleTotal,
      hasCustomer,
      mode: paymentMode,
      typed: amountPaid,
    }),
    dirty,
    error,
    clearError,
    busyOn,
    save,
  };
}
