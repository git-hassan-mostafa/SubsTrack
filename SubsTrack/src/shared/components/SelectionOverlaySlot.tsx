import type { ReactNode } from "react";
import { View } from "react-native";

interface Props {
  /** True while the screen is in multi-select mode. */
  selecting: boolean;
  /** Bar overlaid in the reserved space while selecting (e.g. <SelectAllBar />). */
  overlay: ReactNode;
  /**
   * Normal top controls (search, filters, tabs). Kept mounted while selecting so
   * their layout space — and the scroll position of the list below — never
   * changes; only their visibility and interactivity are toggled off.
   */
  children: ReactNode;
}

/**
 * Preserves the top controls' layout space when entering selection mode so the
 * list never jumps. The controls stay mounted but invisible and untappable,
 * while the select-all bar is overlaid in the exact same space. The overlay is
 * pinned to `top-4` so it lines up with the search box (which sits under `pt-4`).
 */
export function SelectionOverlaySlot({ selecting, overlay, children }: Props) {
  return (
    <View className="relative">
      <View
        className={selecting ? "opacity-0" : ""}
        pointerEvents={selecting ? "none" : "auto"}
      >
        {children}
      </View>
      {selecting ? (
        <View className="absolute inset-x-0 top-4" pointerEvents="box-none">
          {overlay}
        </View>
      ) : null}
    </View>
  );
}
