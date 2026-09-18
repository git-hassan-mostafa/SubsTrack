import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Chip } from "@/src/shared/components/Chip";

interface Props {
  amount: string;
  approx?: string | null;
  billCount: number;
}

/** What the sheet is about, in one figure — the money sheets' shared opening. */
export function CollectHero({ amount, approx, billCount }: Props) {
  const { t } = useTranslation();
  return (
    <View className="mb-4 items-center gap-0.5">
      <View className="flex-row items-baseline gap-2">
        <Text fontWeight="Bold" className="text-3xl text-gray-900">
          {amount}
        </Text>
        {approx ? (
          <Text className="text-sm text-gray-500">{approx}</Text>
        ) : null}
      </View>
      <View>
        <Chip
          text={
            billCount > 1
              ? t("ledger.owed_bills", { count: billCount })
              : t("ledger.owed")
          }
          tone="red"
          size="md"
        />
      </View>
    </View>
  );
}
