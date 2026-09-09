import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  AppTextInput,
  NOTE_FIELD_STYLE,
} from "@/src/shared/components/AppTextInput";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import type { SaleVoidResult } from "../utils/types";
import { COLORS } from "@/src/shared/constants";
import { useTextField } from "@/src/shared/hooks/useTextField";
import {
  collectionService,
  SharedBillsWarning,
  sharedBillsAcross,
  type SharedBill,
} from "@/src/modules/ledger";

interface Props {
  saleIds: string[];
  chargeIds: string[];
  onVoided: (result: SaleVoidResult) => void;
  onDismiss: () => void;
}

// Voids several sales with one shared reason via the slice's voidSales batch.
// A total failure keeps the dialog open with the error; any success closes it
// and reports counts back to the screen.
//
// The message states that any money collected goes with the sale. It never
// COUNTS the hand-overs — a bare number warns nobody; it names the other bills
// they also settled instead, since a shared hand-over is voided whole (#125).
export function SaleBulkVoidSheet({ saleIds, chargeIds, onVoided, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidSales = useSaleSlice((s) => s.voidSales);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);
  const [reason, setReason] = useState("");
  const field = useTextField(reason, setReason);
  const [shared, setShared] = useState<SharedBill[]>([]);
  const [checking, setChecking] = useState(chargeIds.length > 0);
  const chargeKey = chargeIds.join(",");

  useEffect(() => {
    let live = true;
    const ids = chargeKey ? chargeKey.split(",") : [];
    if (ids.length === 0) {
      setShared([]);
      setChecking(false);
      return;
    }
    setChecking(true);
    void (async () => {
      try {
        const perCharge = await Promise.all(
          ids.map((id) => collectionService.getPaymentsForCharge(id)),
        );
        const payments = perCharge.flat().filter((c) => c.voidedAt === null);
        const byId = new Map(payments.map((c) => [c.id, c]));
        const bills = sharedBillsAcross([...byId.values()], null, t).filter(
          (b) => !ids.includes(b.chargeId),
        );
        if (live) setShared(bills);
      } catch {
      } finally {
        if (live) setChecking(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [chargeKey, t]);

  async function handleConfirm() {
    if (!user) return;
    clearError();
    const result = await voidSales(saleIds, user.id, reason);
    if (result.ok === 0 && result.failed > 0) return;
    setReason("");
    onVoided(result);
  }

  function handleDismiss() {
    setReason("");
    clearError();
    onDismiss();
  }

  return (
    <ConfirmDialog
      visible
      title={t("sales.bulk_void_title", { count: saleIds.length })}
      message={t("sales.bulk_void_message", { count: saleIds.length })}
      confirmLabel={t("sales.void_sale")}
      confirmDisabled={checking}
      destructive
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
      {checking ? (
        <View className="mb-3 items-start">
          <ActivityIndicator />
        </View>
      ) : null}
      {shared.length > 0 ? (
        <View className="mb-3">
          <SharedBillsWarning bills={shared} />
        </View>
      ) : null}
      {error ? (
        <View className="mb-2">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}
      <AppTextInput
        {...field}
        placeholder={t("sales.void_reason_placeholder")}
        multiline
        numberOfLines={3}
        onFocus={clearError}
        style={NOTE_FIELD_STYLE}
        placeholderTextColor={COLORS.gray400}
      />
    </ConfirmDialog>
  );
}
