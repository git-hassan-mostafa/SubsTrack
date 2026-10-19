import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { Button } from "@/src/shared/components/Button";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { Input } from "@/src/shared/components/Input";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import type { CustomerPlan } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import { amountText, decimalDigitsOnly, parseAmount } from "@shared/core/utils/inputText";
import { useMeterReading } from "@shared/modules/customer/customer-payments/hooks/useMeterReading";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";

interface Props {
  line: CustomerPlan;
  billingMonth: string;
  onDismiss: () => void;
}

const echoAmount = (next: string) => amountText(parseAmount(next));

export function MeterReadingSheet({ line, billingMonth, onDismiss }: Props) {
  const { t } = useTranslation();
  const form = useMeterReading(line, billingMonth);
  const { text, draft, locked } = form;
  if (!text) return null;
  const meter = form.entry === "reading";
  const change = draft.meterChange;

  async function handleSave() {
    if (await form.save()) onDismiss();
  }

  async function handleRemove() {
    if (await form.remove()) onDismiss();
  }

  function handleDismiss() {
    form.clearError();
    onDismiss();
  }

  const menuActions: ActionMenuItem[] | undefined =
    form.saved && !locked
      ? [
          {
            key: "remove",
            label: t("payments.reading.remove"),
            icon: "trash-outline",
            group: "danger",
            destructive: true,
            onPress: () => void handleRemove(),
          },
        ]
      : undefined;

  return (
    <FormSheet
      onDismiss={handleDismiss}
      dirty={form.dirty}
      title={text.title}
      subject={lineLabel(line, t("common.no_plan"))}
      menuActions={menuActions}
    >
      {form.error ? (
        <View className="mb-4">
          <ErrorBanner message={form.error} onDismiss={form.clearError} />
        </View>
      ) : null}

      {locked ? (
        <Text className="text-sm text-gray-600 mb-4">{text.locked}</Text>
      ) : null}

      <View className="mb-4">
        <InfoRows
          rows={[
            { label: t("payments.reading.meter_number"), value: meter ? form.meterNumber : null },
            { label: t("payments.reading.previous"), value: text.previous },
            {
              label: t("payments.reading.saved_on"),
              value: form.saved ? formatDateTime(form.saved.recordedAt) : null,
            },
          ]}
        />
      </View>

      <Input
        label={text.valueLabel}
        value={amountText(draft.value)}
        onChangeText={(next) => form.setValue(parseAmount(next))}
        sanitize={decimalDigitsOnly}
        expectedEcho={echoAmount}
        keyboardType="decimal-pad"
        editable={!locked}
        onFocus={form.clearError}
      />

      {meter ? (
        <PressableOpacity
          onPress={() => form.setMeterReplaced(!change)}
          disabled={locked}
          containerClassName="rounded-xl mb-4"
          className="flex-row items-center gap-3 py-2"
        >
          <Checkbox checked={!!change} disabled={locked} />
          <Text className="text-base text-gray-900">{t("payments.reading.meter_replaced")}</Text>
        </PressableOpacity>
      ) : null}

      {meter && change ? (
        <>
          <Input
            label={t("payments.reading.old_meter_final")}
            value={amountText(change.oldMeterFinal)}
            onChangeText={(next) => form.editMeterChange({ oldMeterFinal: parseAmount(next) })}
            sanitize={decimalDigitsOnly}
            expectedEcho={echoAmount}
            keyboardType="decimal-pad"
            editable={!locked}
          />
          <Input
            label={t("payments.reading.new_meter_start")}
            value={amountText(change.newMeterStart)}
            onChangeText={(next) => form.editMeterChange({ newMeterStart: parseAmount(next) })}
            sanitize={decimalDigitsOnly}
            expectedEcho={echoAmount}
            keyboardType="decimal-pad"
            editable={!locked}
          />
          <Input
            label={t("payments.reading.new_meter_number")}
            value={change.newMeterNumber}
            onChangeText={(next) => form.editMeterChange({ newMeterNumber: next })}
            editable={!locked}
          />
        </>
      ) : null}

      {text.units || text.bill || text.note || text.warnings.length > 0 ? (
        <View className="mb-4 gap-2">
          <InfoRows
            rows={[
              { label: t("payments.reading.units"), value: text.units },
              { label: t("payments.reading.bill"), value: text.bill },
            ]}
          />
          {text.note ? <Text className="text-sm text-gray-500">{text.note}</Text> : null}
          {text.warnings.map((warning) => (
            <Text key={warning} className="text-sm text-amber-700">
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      {locked ? null : (
        <Button
          label={t("common.save")}
          onPress={handleSave}
          loading={form.saving}
          disabled={!form.canSave}
          fullWidth
        />
      )}

      <View className="h-24" />
    </FormSheet>
  );
}
