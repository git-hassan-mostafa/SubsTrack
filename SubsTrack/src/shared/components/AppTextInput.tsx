import { useContext, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { COLORS } from "@/src/shared/constants";
import { InsideBottomSheetContext } from "./bottomSheetInputContext";

interface AppTextInputProps extends TextInputProps {
  containerClassName?: string;
}

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
  const insideSheet = useContext(InsideBottomSheetContext);
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const Field = (
    insideSheet && Platform.OS !== "web" ? BottomSheetTextInput : TextInput
  ) as unknown as typeof TextInput;

  const shielded =
    Platform.OS !== "web" && !focused && props.editable !== false;

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
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => ref.current?.focus()}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );
}
