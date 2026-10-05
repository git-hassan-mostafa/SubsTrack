import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import {
  FormSheet,
  type SheetScrollTo,
} from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CARD_SURFACE } from "@/src/shared/constants";
import type { OpenItem } from "@shared/core/types";
import { useCollectForm } from "@shared/modules/ledger/hooks/useCollectForm";
import type { CollectSubmission } from "@shared/modules/ledger/utils/collectForm";
import { groupKey } from "@shared/modules/ledger/utils/currencyGroups";
import { collectBlockerKey } from "@shared/modules/ledger/utils/allocationRows";
import { useRefusedSave } from "@shared/shared/hooks/useRefusedSave";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { CollectAllButton } from "./CollectAllButton";
import { CollectHero } from "./CollectHero";
import { CurrencyCollectSection } from "./CurrencyCollectSection";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  customerName: string;
  owed: OpenItem[];
  loading: boolean;
  onSubmit: (submission: CollectSubmission) => void;
  singleItem?: OpenItem | null;
}

// The one door money comes in through — see docs/features.md (Ledger).
export function CollectSheet({
  visible,
  onDismiss,
  customerName,
  owed,
  loading,
  onSubmit,
  singleItem = null,
}: Props) {
  const { t } = useTranslation();
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const form = useCollectForm(owed, singleItem);
  const { single, pool, currencies, display } = form;
  const refused = useRefusedSave(form.canSubmit);

  useEffect(() => {
    if (visible) clearError();
  }, [visible, clearError]);

  const scrollBody = useRef<SheetScrollTo | null>(null);
  useEffect(() => {
    if (error) scrollBody.current?.(0);
  }, [error]);

  const openItem = single?.item.openAmount ? single : null;
  const submit = () => {
    if (loading) return;
    const submission = form.submission();
    if (!submission) {
      refused.refuse(collectBlockerKey(form));
      return;
    }
    onSubmit(submission);
  };

  return (
    <FormSheet
      visible={visible}
      onDismiss={onDismiss}
      dirty={form.dirty}
      scrollRef={scrollBody}
      title={t("ledger.collect_money")}
      subject={singleItem ? singleItem.label : customerName}
    >
      <View>
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {single ? (
          <>
            {openItem ? (
              <Text
                className={`${CARD_SURFACE} mb-4 px-4 py-3 text-sm text-gray-600`}
              >
                {t("ledger.open_amount_hint")}
              </Text>
            ) : (
              <CollectHero amount={single.money(single.plan.max)} billCount={1} />
            )}

            {openItem && (
              <CurrencyInput
                label={t("ledger.month_amount")}
                amount={single.openBill}
                currencyId={single.currencyId}
                currencies={currencies}
                onChange={single.setOpenBill}
              />
            )}

            <CurrencyInput
              label={t("ledger.amount")}
              labelAction={
                openItem ? null : <CollectAllButton onPress={single.collectAll} />
              }
              amount={single.amount}
              currencyId={single.currencyId}
              currencies={currencies}
              lockCurrency
              onChange={(next) => single.setAmount(next.amount)}
            />

            {single.plan.partial && (
              <Text className="-mt-2 mb-4 text-xs text-amber-700">
                {t("ledger.partial_leaves_debt")}
              </Text>
            )}

            {single.plan.overpaying && (
              <ErrorBanner
                message={t("ledger.over_by_single", {
                  max: single.money(single.plan.max),
                })}
                onDismiss={single.collectAll}
              />
            )}
          </>
        ) : (
          <>
            <CollectHero
              amount={pool.heroAmount}
              approx={pool.heroApprox}
              billCount={pool.billCount}
            />

            {pool.multiCurrency && (
              <View
                className={`${CARD_SURFACE} mb-4 flex-row items-center gap-3 px-4 py-3`}
              >
                <Text className="flex-1 text-xs text-gray-500">
                  {t("ledger.multi_currency_hint")}
                </Text>
                <CollectAllButton onPress={pool.collectEverything} />
              </View>
            )}

            {pool.plans.map((plan) => (
              <CurrencyCollectSection
                key={groupKey(plan)}
                plan={plan}
                currencies={currencies}
                display={display}
                excluded={pool.excluded}
                grouped={pool.multiCurrency}
                onChangeAmount={(amount) => pool.setAmount(groupKey(plan), amount)}
                onToggle={pool.toggle}
              />
            ))}

            {pool.multiCurrency && (
              <View className="mb-4 flex-row items-center justify-between border-t border-gray-100 pt-3">
                <Text fontWeight="Bold" className="text-sm text-gray-900">
                  {t("ledger.total_collecting")}
                </Text>
                <Text fontWeight="Bold" className="text-base text-gray-900">
                  {pool.collectingText}
                </Text>
              </View>
            )}
          </>
        )}

        <DatePickerInput
          label={t("ledger.received_at")}
          value={form.receivedAt}
          onChange={form.pickReceivedAt}
          showTime
        />

        <Input
          label={t("ledger.notes")}
          placeholder={t("ledger.notes_placeholder")}
          value={form.notes}
          onChangeText={form.setNotes}
          multiline
        />

        {refused.reasonKey ? (
          <ErrorBanner message={t(refused.reasonKey)} onDismiss={refused.clear} />
        ) : null}

        <Button
          label={t("common.save")}
          onPress={submit}
          disabled={loading}
          loading={loading}
        />
      </View>
    </FormSheet>
  );
}
