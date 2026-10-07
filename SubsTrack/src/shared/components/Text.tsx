import { Text as RNText, TextProps, StyleSheet, Platform } from "react-native";
import { useLanguageStore } from "@/src/core/i18n/languageStore";

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
    Platform.OS === "web"
      ? {
          writingDirection: "ltr" as const,
        }
      : null,
    StyleSheet.flatten(style) ?? {},
  ];
  return <RNText style={allStyles} {...props} />;
}
