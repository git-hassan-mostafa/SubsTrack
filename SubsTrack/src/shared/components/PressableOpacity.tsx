import { TouchableOpacity, type TouchableOpacityProps } from "react-native";

interface PressableOpacityProps extends TouchableOpacityProps {
  pressedOpacity?: number;
}

export function PressableOpacity({
  pressedOpacity = 0.6,
  ...props
}: PressableOpacityProps) {
  return <TouchableOpacity activeOpacity={pressedOpacity} {...props} />;
}
