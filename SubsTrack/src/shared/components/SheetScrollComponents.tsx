import { forwardRef, type ForwardedRef, type ReactElement } from "react";
import {
  FlatList,
  ScrollView,
  SectionList,
  type DefaultSectionT,
  type FlatListProps,
  type ScrollViewProps,
  type SectionListProps,
} from "react-native";
import { useSheetScrollProps } from "@/src/shared/lib/sheetScrollContext";

export interface SheetScrollViewProps extends ScrollViewProps {
  inSheet?: boolean;
}

export interface SheetFlatListProps<T> extends FlatListProps<T> {
  inSheet?: boolean;
}

export interface SheetSectionListProps<ItemT, SectionT = DefaultSectionT>
  extends SectionListProps<ItemT, SectionT> {
  inSheet?: boolean;
}

function SheetScrollViewComponent(
  {
    inSheet = true,
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
    ...props
  }: SheetScrollViewProps,
  ref: ForwardedRef<ScrollView>,
): ReactElement {
  const scrollProps = useSheetScrollProps(inSheet, {
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
  });
  return <ScrollView ref={ref} {...props} {...scrollProps} />;
}

export const SheetScrollView = forwardRef(SheetScrollViewComponent);

function SheetFlatListComponent<T>(
  {
    inSheet = true,
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
    ...props
  }: SheetFlatListProps<T>,
  ref: ForwardedRef<FlatList<T>>,
): ReactElement {
  const scrollProps = useSheetScrollProps(inSheet, {
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
  });
  return <FlatList ref={ref} {...props} {...scrollProps} />;
}

export const SheetFlatList = forwardRef(SheetFlatListComponent) as <T>(
  props: SheetFlatListProps<T> & { ref?: ForwardedRef<FlatList<T>> },
) => ReactElement;

function SheetSectionListComponent<ItemT, SectionT = DefaultSectionT>(
  {
    inSheet = true,
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
    ...props
  }: SheetSectionListProps<ItemT, SectionT>,
  ref: ForwardedRef<SectionList<ItemT, SectionT>>,
): ReactElement {
  const scrollProps = useSheetScrollProps(inSheet, {
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
  });
  return <SectionList ref={ref} {...props} {...scrollProps} />;
}

export const SheetSectionList = forwardRef(SheetSectionListComponent) as <
  ItemT,
  SectionT = DefaultSectionT,
>(
  props: SheetSectionListProps<ItemT, SectionT> & {
    ref?: ForwardedRef<SectionList<ItemT, SectionT>>;
  },
) => ReactElement;
