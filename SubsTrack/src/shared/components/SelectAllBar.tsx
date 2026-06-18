import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { Checkbox } from "./Checkbox";
import { PressableOpacity } from "./PressableOpacity";

interface Props {
  allSelected: boolean;
  /** Selects every visible row when not all selected; clears them when all are. */
  onToggle: () => void;
}

// A thin "select all" row shown directly above a list while in selection mode.
// `allSelected` is derived from the visible rows by the screen; `onToggle`
// wires to `useSelection().toggleMany(visibleIds)`.
export function SelectAllBar({ allSelected, onToggle }: Props) {
  const { t } = useTranslation();
  return (
    <PressableOpacity
      onPress={onToggle}
      accessibilityLabel={t("common.select_all")}
      className="flex-row items-center gap-2 px-4 py-3 bg-white border-b border-gray-100"
    >
      <Checkbox checked={allSelected} size={22} />
      <Text className="text-sm font-medium text-gray-700">
        {t("common.select_all")}
      </Text>
    </PressableOpacity>
  );
}
