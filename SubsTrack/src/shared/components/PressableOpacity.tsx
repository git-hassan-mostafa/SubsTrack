import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface PressableOpacityProps extends PressableProps {
  pressedOpacity?: number;
}

export function PressableOpacity({
  style,
  disabled,
  pressedOpacity = 0.7,
  ...props
}: PressableOpacityProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={(state) => {
        const base: StyleProp<ViewStyle> =
          typeof style === "function" ? style(state) : style;
        if (state.pressed && !disabled) {
          return [base, { opacity: pressedOpacity }];
        }
        return base;
      }}
    />
  );
}
