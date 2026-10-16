import { ActivityIndicator } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "../constants";
import { PressableOpacity } from "./PressableOpacity";

type Variant = "primary" | "danger" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<
  Variant,
  { container: string; text: string; ripple: string }
> = {
  primary: { container: "bg-primary", text: "text-white", ripple: COLORS.rippleOnDark },
  danger: { container: "bg-danger", text: "text-white", ripple: COLORS.rippleOnDark },
  ghost: {
    container: "bg-transparent border border-gray-300",
    text: "text-gray-700",
    ripple: COLORS.ripple,
  },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  fullWidth,
}: ButtonProps) {
  const styles = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <PressableOpacity
      onPress={onPress}
      disabled={isDisabled}
      rippleColor={styles.ripple}
      containerClassName={`rounded-full ${styles.container} ${fullWidth ? "w-full" : ""} ${isDisabled ? "opacity-50" : ""}`}
      className="min-h-12 py-3 px-6 items-center justify-center"
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "ghost" ? COLORS.gray700 : COLORS.white}
          size="small"
        />
      ) : (
        <Text fontWeight="SemiBold" className={`text-base ${styles.text}`}>
          {label}
        </Text>
      )}
    </PressableOpacity>
  );
}
