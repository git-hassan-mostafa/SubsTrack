import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { COLORS } from "@/src/shared/constants";

interface Props {
  saleIds: string[];
  onVoided: (result: { ok: number; failed: number }) => void;
  onDismiss: () => void;
}

// Voids several sales with one shared reason via the slice's voidSales batch.
// A total failure keeps the dialog open with the error; any success closes it
// and reports counts back to the screen.
export function SaleBulkVoidSheet({ saleIds, onVoided, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidSales = useSaleSlice((s) => s.voidSales);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  async function handleConfirm() {
    if (!user) return;
    clearError();
    const result = await voidSales(saleIds, user.id, reason);
    if (result.ok === 0 && result.failed > 0) return; // total failure — keep open
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
      destructive
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
      {error ? (
        <View className="mb-2">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder={t("sales.void_reason_placeholder")}
        multiline
        numberOfLines={3}
        onFocus={clearError}
        style={{
          fontFamily: "Cairo",
          borderWidth: 1,
          borderColor: COLORS.gray200 ?? "#E5E7EB",
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 14,
          color: "#111827",
          backgroundColor: "#fff",
          textAlignVertical: "top",
        }}
        placeholderTextColor={COLORS.gray400}
      />
    </ConfirmDialog>
  );
}
