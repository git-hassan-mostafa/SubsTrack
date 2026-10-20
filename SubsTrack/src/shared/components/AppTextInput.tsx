import { useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";

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

// the ONLY text field in the app — never `TextInput` (gotcha #78)
export function AppTextInput({
  containerClassName,
  onFocus,
  onBlur,
  style,
  ...props
}: AppTextInputProps) {
  const fieldRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const shielded =
    Platform.OS !== "web" && !focused && props.editable !== false;

  return (
    <View className={containerClassName}>
      <TextInput
        {...props}
        ref={fieldRef}
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
        <PressableOpacity
          ripple="none"
          onPress={() => fieldRef.current?.focus()}
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );
}
