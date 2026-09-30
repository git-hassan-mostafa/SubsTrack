import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { findCurrency } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import type { CollectionCorrection } from "@shared/modules/ledger/services/CollectionService";
import { useCorrectPayment } from "@shared/modules/ledger/hooks/useCorrectPayment";
import { CurrencyCollectSection } from "./CurrencyCollectSection";

const NO_SKIPS: ReadonlySet<string> = new Set();

interface Props {
  collectionId: string;
  onDone: (result: CollectionCorrection) => void;
  onDismiss: () => void;
}

// Fixes a mistyped amount: void the hand-over, re-record it — gotcha #171.
export function CorrectCollectionSheet({
  collectionId,
  onDone,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const userName = useUserNames();
  const form = useCorrectPayment(collectionId);
  const [saving, setSaving] = useState(false);
  const { draft, original, plan, money } = form;

  async function save() {
    if (saving || !form.canSave) return;
    setSaving(true);
    try {
      const result = await form.save();
      if (result) onDone(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      visible
      onDismiss={onDismiss}
      dirty={form.dirty}
      title={t("ledger.correct_payment")}
      subject={draft?.pool[0]?.customerName || null}
    >
      <View className="pb-6">
        {form.loadError ? (
          <ErrorBanner message={form.loadError} onDismiss={onDismiss} />
        ) : null}
        {form.error ? (
          <ErrorBanner message={form.error} onDismiss={form.clearError} />
        ) : null}

        {!draft && !form.loadError ? (
          <View className="items-center py-16">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : null}

        {original && plan ? (
          <>
            <Text
              className={`${CARD_SURFACE} mb-4 px-4 py-3 text-sm text-gray-600`}
            >
              {t("ledger.correct_hint")}
            </Text>

            <View className="mb-4">
              <InfoRows
                rows={[
                  {
                    label: t("ledger.recorded_amount"),
                    value: money(original.amount),
                  },
                  {
                    label: t("ledger.received_at"),
                    value: formatDateTime(original.receivedAt),
                  },
                  {
                    label: t("ledger.collected_by"),
                    value:
                      userName(original.receivedByUserId) ??
                      t("common.unknown"),
                  },
                ]}
              />
            </View>

            <CurrencyCollectSection
              plan={plan}
              currencies={form.currencies}
              display={findCurrency(form.currencies, original.currencyId)}
              excluded={NO_SKIPS}
              grouped={false}
              onChangeAmount={form.setAmount}
            />

            {form.problem === "zero" ? (
              <Text className="-mt-2 mb-4 text-xs text-amber-700">
                {t("ledger.correct_zero_hint")}
              </Text>
            ) : null}

            <Input
              label={t("ledger.correct_note")}
              placeholder={t("ledger.correct_note_placeholder")}
              value={form.note}
              onChangeText={form.setNote}
              multiline
            />

            <Button
              label={t("ledger.save_correction")}
              onPress={() => void save()}
              disabled={saving || !form.canSave}
              loading={saving}
            />
          </>
        ) : null}
      </View>
    </FormSheet>
  );
}
