import { useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from "@gorhom/bottom-sheet";
import { COLORS } from "@/src/shared/constants";

interface AppTextInputProps extends TextInputProps {
  containerClassName?: string;
}

const TAP_SLOP = 8;

const BASE_TEXT_STYLE: TextStyle = {
  fontFamily: "Cairo",
  includeFontPadding: false,
};

/** The bordered multi-line note box every void / skip reason field uses. */
export const NOTE_FIELD_STYLE: TextStyle = {
  borderWidth: 1,
  borderColor: COLORS.gray200 ?? "#E5E7EB",
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 14,
  color: "#111827",
  backgroundColor: "#fff",
  textAlignVertical: "top",
};

/** The ONLY text field in the app — never `TextInput` (gotcha #78). */
export function AppTextInput({
  containerClassName,
  onFocus,
  onBlur,
  style,
  ...props
}: AppTextInputProps) {
  const insideSheet = useBottomSheetInternal(true) !== null;
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const Field = (
    insideSheet && Platform.OS !== "web" ? BottomSheetTextInput : TextInput
  ) as unknown as typeof TextInput;

  const shielded =
    Platform.OS !== "web" && !focused && props.editable !== false;

  const shieldTap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(TAP_SLOP)
        .onEnd(() => ref.current?.focus())
        .runOnJS(true),
    [],
  );

  return (
    <View className={containerClassName}>
      <Field
        {...props}
        ref={ref}
        style={[BASE_TEXT_STYLE, style]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {shielded ? (
        <GestureDetector gesture={shieldTap}>
          <View
            style={StyleSheet.absoluteFill}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </GestureDetector>
      ) : null}
    </View>
  );
}
