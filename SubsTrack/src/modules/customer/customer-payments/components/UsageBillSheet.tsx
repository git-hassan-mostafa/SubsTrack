import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { Input } from "@/src/shared/components/Input";
import { Text } from "@/src/shared/components/Text";
import type { CustomerPlan, MonthEntry, OpenItem } from "@shared/core/types";
import { amountText, decimalDigitsOnly, parseAmount } from "@shared/core/utils/inputText";
import { useUsageBillEdit } from "@shared/modules/customer/customer-payments/hooks/useUsageBillEdit";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";

interface Props {
  line: CustomerPlan;
  entry: MonthEntry;
  item: OpenItem;
  onDismiss: () => void;
}

const echoAmount = (next: string) => amountText(parseAmount(next));

export function UsageBillSheet({ line, entry, item, onDismiss }: Props) {
  const { t } = useTranslation();
  const form = useUsageBillEdit(line, entry, item);

  async function handleSave() {
    if (await form.save()) onDismiss();
  }

  function handleDismiss() {
    form.clearError();
    onDismiss();
  }

  return (
    <FormSheet
      onDismiss={handleDismiss}
      dirty={form.dirty}
      title={form.title}
      subject={lineLabel(line, t("common.no_plan"))}
    >
      {form.error ? (
        <View className="mb-4">
          <ErrorBanner message={form.error} onDismiss={form.clearError} />
        </View>
      ) : null}

      <View className="mb-4">
        <InfoRows
          rows={[
            { label: t("payments.reading.units"), value: form.units },
            { label: t("ledger.usage_worked_out"), value: form.workedOut },
          ]}
        />
      </View>

      <Input
        label={form.amountLabel}
        value={amountText(form.amount)}
        onChangeText={(next) => form.setAmount(parseAmount(next))}
        sanitize={decimalDigitsOnly}
        expectedEcho={echoAmount}
        keyboardType="decimal-pad"
        onFocus={form.clearError}
      />

      <Text className="text-sm text-gray-500 mb-4">{t("payments.usage_bill.hint")}</Text>

      {form.canResetToWorkedOut ? (
        <View className="mb-4">
          <Button
            label={t("payments.usage_bill.use_worked_out")}
            variant="ghost"
            onPress={form.resetToWorkedOut}
            fullWidth
          />
        </View>
      ) : null}

      <Button
        label={t("common.save")}
        onPress={handleSave}
        loading={form.saving}
        disabled={!form.canSave}
        fullWidth
      />

      <View className="h-24" />
    </FormSheet>
  );
}
