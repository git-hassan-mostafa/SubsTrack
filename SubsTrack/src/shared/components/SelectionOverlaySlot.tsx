import type { ReactNode } from "react";
import { View } from "react-native";

interface Props {
  /** True while the screen is in multi-select mode. */
  selecting: boolean;
  /**
   * Normal top controls (search, filters, tabs). Kept mounted while selecting so
   * their layout space — and the scroll position of the list below — never
   * changes; only their visibility and interactivity are toggled off.
   */
  children: ReactNode;
}

/**
 * Preserves the top controls' layout space when entering selection mode so the
 * list never jumps. The controls stay mounted but invisible and untappable while
 * selecting. The whole selection UI (close, count, select-all checkbox, actions)
 * lives on the single toolbar row that `PageHeader` overlays over the header, so
 * this slot only needs to blank the search/filter row — it renders no overlay.
 */
export function SelectionOverlaySlot({ selecting, children }: Props) {
  return (
    <View
      className={selecting ? "opacity-0" : ""}
      pointerEvents={selecting ? "none" : "auto"}
    >
      {children}
    </View>
  );
}
