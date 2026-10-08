import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { Text } from "@/src/shared/components/Text";
import { currentBillingMonth } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { priceStartOptions } from "@shared/modules/customer/customer-plans/utils/priceStartOptions";

interface Props {
  value: string | undefined;
  onChange: (month: string) => void;
}

// Shown only once a saved price was changed — gotcha #185.
export function PriceStartPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <View>
      <Dropdown<string>
        label={t("subscriptions.price_from_label")}
        options={priceStartOptions()}
        value={value ?? currentBillingMonth()}
        onChange={(month) => {
          if (month) onChange(month);
        }}
      />
      <Text className="text-xs text-gray-400 -mt-3 mb-4">
        {t("subscriptions.price_from_hint")}
      </Text>
    </View>
  );
}
