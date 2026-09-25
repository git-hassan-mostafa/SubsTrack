import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { useUserNames } from "@/src/shared/hooks/useUserNames";
import {
  findCurrency,
  formatMoney,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDateTime } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import {
  collectionService,
  type CollectionCorrection,
  type CorrectionDraft,
} from "../services/CollectionService";
import {
  groupKey,
  groupOwedByCurrency,
  planCollection,
} from "../utils/currencyGroups";
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
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const userName = useUserNames();
  const correctCollection = useLedgerSlice((s) => s.correctCollection);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  const [draft, setDraft] = useState<CorrectionDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    collectionService.getCorrection(collectionId).then(
      (next) => {
        if (!active) return;
        setDraft(next);
        setAmount(next.collection.amount);
      },
      (e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [collectionId]);

  useEffect(() => () => clearError(), [clearError]);

  const group = useMemo(
    () =>
      draft ? (groupOwedByCurrency(draft.pool, currencies)[0] ?? null) : null,
    [draft, currencies],
  );
  const plan = useMemo(
    () =>
      group
        ? planCollection(
            [group],
            new Map([[groupKey(group), amount]]),
            NO_SKIPS,
          )[0]
        : null,
    [group, amount],
  );

  const original = draft?.collection ?? null;
  const source = original ? snapshotCurrency(original, currencies) : null;
  const money = (value: number) => formatMoney(value, source, source);
  const typed = amount ?? 0;
  const unchanged = !!original && Math.abs(typed - original.amount) < 1e-9;
  const dirty = !!original && (!unchanged || note.trim() !== "");
  const canSave =
    !saving &&
    !!plan &&
    !!user &&
    typed > 0 &&
    !unchanged &&
    plan.lines.length > 0 &&
    plan.leftover <= 0;

  const changeAmount = (next: number | null) => {
    clearError();
    setAmount(next);
  };

  async function save() {
    if (!canSave || !original || !user) return;
    const reason = [
      t("ledger.corrected_reason", {
        from: money(original.amount),
        to: money(typed),
      }),
      note.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
    setSaving(true);
    try {
      const result = await correctCollection({
        collectionId,
        amount: typed,
        actorUserId: user.id,
        reason,
      });
      if (result) onDone(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      visible
      onDismiss={onDismiss}
      dirty={dirty}
      title={t("ledger.correct_payment")}
      subject={draft?.pool[0]?.customerName || null}
    >
      <View className="pb-6">
        {loadError ? (
          <ErrorBanner message={loadError} onDismiss={onDismiss} />
        ) : null}
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {!draft && !loadError ? (
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
              currencies={currencies}
              display={findCurrency(currencies, original.currencyId)}
              excluded={NO_SKIPS}
              grouped={false}
              onChangeAmount={changeAmount}
            />

            {typed <= 0 ? (
              <Text className="-mt-2 mb-4 text-xs text-amber-700">
                {t("ledger.correct_zero_hint")}
              </Text>
            ) : null}

            <Input
              label={t("ledger.correct_note")}
              placeholder={t("ledger.correct_note_placeholder")}
              value={note}
              onChangeText={setNote}
              multiline
            />

            <Button
              label={t("ledger.save_correction")}
              onPress={() => void save()}
              disabled={!canSave}
              loading={saving}
            />
          </>
        ) : null}
      </View>
    </FormSheet>
  );
}
