import { Text as RNText, TextProps, StyleSheet } from "react-native";

interface Props extends TextProps {
  fontWeight?: "Bold" | "Medium" | "Regular" | "SemiBold";
}

export function Text({ style, ...props }: Props) {
  const allStyles = [
    { fontFamily: "Cairo" + (props.fontWeight ? "-" + props.fontWeight : "") },
    StyleSheet.flatten(style) ?? {},
  ];
  return <RNText style={allStyles} {...props} />;
}
