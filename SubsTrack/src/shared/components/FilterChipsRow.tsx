import type { ReactNode, RefObject } from "react";
import { ScrollView, View } from "react-native";

interface Props {
  children: ReactNode;
  inset?: number;
  className?: string;
  scrollRef?: RefObject<ScrollView | null>;
}

// The one-line sideways-scrolling chip row every filter bar uses. `inset` cancels
// the parent's horizontal padding so chips bleed to both screen edges; pass
// `scrollRef` to useHorizontalSwipe's `blockedBy` so a fast flick scrolls the
// chips instead of switching tab — see gotcha #138.
export function FilterChipsRow({
  children,
  inset = 16,
  className = "",
  scrollRef,
}: Props) {
  return (
    <View style={{ marginHorizontal: -inset }} className={className}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: inset,
          gap: 8,
          alignItems: "center",
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
