import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Customer } from "@shared/core/types";
import { planSummary } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { Avatar } from "@/src/shared/components/Avatar";
import { RoundAction } from "@/src/shared/components/RoundAction";
import { Text } from "@/src/shared/components/Text";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import { callPhone } from "@/src/shared/lib/phone";

interface Props {
  customer: Customer;
  onEdit: () => void;
  onHistory: () => void;
}

// contact-style header: the name leads the page, the header bar carries no name
export function CustomerHero({ customer, onEdit, onHistory }: Props) {
  const { t } = useTranslation();
  const hasPhone = !!customer.phoneNumber;
  const summary = planSummary(customer, t);

  return (
    <View className="items-center px-4 pt-2 pb-4">
      <Avatar name={customer.name} size={72} />
      <Text
        fontWeight="SemiBold"
        className="text-xl text-gray-900 text-center mt-3"
        numberOfLines={2}
      >
        {customer.name}
      </Text>
      {hasPhone ? (
        <Text className="text-sm text-gray-600 mt-0.5">{customer.phoneNumber}</Text>
      ) : null}
      {summary ? (
        <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
          {summary}
        </Text>
      ) : null}

      <View className="flex-row self-stretch mt-4">
        <RoundAction
          icon="call-outline"
          label={t("customers.call_action")}
          disabled={!hasPhone}
          onPress={() => void callPhone(customer.phoneNumber)}
        />
        <RoundAction
          icon="logo-whatsapp"
          label={t("whatsapp.title")}
          disabled={!hasPhone}
          onPress={() => void openWhatsApp(customer.phoneNumber)}
        />
        <RoundAction icon="create-outline" label={t("common.edit")} onPress={onEdit} />
        <RoundAction
          icon="time-outline"
          label={t("audit.customer_history_action")}
          onPress={onHistory}
        />
      </View>
    </View>
  );
}
