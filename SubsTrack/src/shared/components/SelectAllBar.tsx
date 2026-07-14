import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { Checkbox } from "./Checkbox";
import { PressableOpacity } from "./PressableOpacity";

interface Props {
  allSelected: boolean;
  /** Selects every visible row when not all selected; clears them when all are. */
  onToggle: () => void;
  /** Number of currently-selected rows, shown at the trailing edge. */
  count?: number;
}

// A thin "select all" row shown directly above a list while in selection mode.
// `allSelected` is derived from the visible rows by the screen; `onToggle`
// wires to `useSelection().toggleMany(visibleIds)`. `count` shows how many rows
// are selected at the trailing edge.
export function SelectAllBar({ allSelected, onToggle, count }: Props) {
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
      {count && count > 0 ? (
        <Text className="ms-auto text-sm font-semibold text-primary">
          {t("common.selected_count", { count })}
        </Text>
      ) : null}
    </PressableOpacity>
  );
}
