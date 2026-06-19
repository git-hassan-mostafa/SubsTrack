import type { ReactNode } from "react";
import { View } from "react-native";

interface Props {
  children: ReactNode;
  /** Extra classes for the container (e.g. "flex-1"). */
  className?: string;
  /** Tailwind max-width class that sets the cap. Defaults to max-w-3xl (768px). */
  maxWidth?: string;
}

/**
 * Caps body width and centers it on wide viewports (desktop web / tablet).
 * Phones are always narrower than the cap, so on phone layouts this is a no-op —
 * the content stays full width. Use to keep cards, grids and sheets from
 * stretching across a wide browser window.
 */
export function ResponsiveContainer({
  children,
  className,
  maxWidth = "max-w-3xl",
}: Props) {
  return (
    <View className={`w-full self-center ${maxWidth} ${className ?? ""}`}>
      {children}
    </View>
  );
}
