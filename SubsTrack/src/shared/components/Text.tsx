import { Text as RNText, TextProps, StyleSheet, Platform } from "react-native";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { RTL_LANGUAGES } from "@/src/core/i18n";

interface Props extends TextProps {
  fontWeight?: "Bold" | "Medium" | "Regular" | "SemiBold";
}

export function Text({ style, ...props }: Props) {
  const allStyles = [
    {
      fontFamily:
        "Cairo" +
        (!!props.fontWeight?.replace("Regular", "")
          ? "-" + props.fontWeight?.replace("Regular", "")
          : ""),
    },
    // On web, RN Web infers each Text's direction from its own content, so an
    // Arabic string aligns/positions RTL even when the UI language is LTR (and
    // vice versa) — e.g. an Arabic customer name floats to the right in English
    // mode. Pin the writing direction to the UI language so web matches native.
    Platform.OS === "web"
      ? {
          writingDirection: "ltr" as const,
        }
      : null,
    StyleSheet.flatten(style) ?? {},
  ];
  return <RNText style={allStyles} {...props} />;
}
