import type { Context, ReactNode } from "react";
import { ScrollView, VirtualizedList } from "react-native";

const VirtualizedListContext = (
  VirtualizedList as unknown as { contextType?: Context<unknown> }
).contextType;
const ScrollViewContext = (
  ScrollView as unknown as { Context?: Context<unknown> }
).Context;

// a sheet opened from a list row must not read its lists as nested — gotcha #45
export function SheetContextReset({ children }: { children: ReactNode }) {
  let node = children;
  if (ScrollViewContext) {
    node = (
      <ScrollViewContext.Provider value={null}>{node}</ScrollViewContext.Provider>
    );
  }
  if (VirtualizedListContext) {
    node = (
      <VirtualizedListContext.Provider value={null}>
        {node}
      </VirtualizedListContext.Provider>
    );
  }
  return <>{node}</>;
}
