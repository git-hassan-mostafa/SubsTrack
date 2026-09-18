import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";

/** The "fill in everything owed" shortcut — one look, wherever it is offered. */
export function CollectAllButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <PressableOpacity
      onPress={onPress}
      hitSlop={8}
      className="rounded-lg bg-gray-100 px-2.5 py-1"
    >
      <Text fontWeight="Medium" className="text-xs text-primary">
        {t("ledger.collect_all")}
      </Text>
    </PressableOpacity>
  );
}
