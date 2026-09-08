import { TextInputProps, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { useSheetTextInput } from "@/src/shared/components/bottomSheetInputContext";
import { useTextField } from "@/src/shared/hooks/useTextField";

interface InputProps extends Omit<TextInputProps, "value"> {
  value: string;
  label?: string;
  error?: string | null;
  sanitize?: (next: string) => string;
}

export function Input({
  label,
  error,
  style,
  value,
  onChangeText,
  sanitize,
  ...props
}: InputProps) {
  const TextInput = useSheetTextInput();
  const field = useTextField(value, onChangeText, { sanitize });
  return (
    <View className="mb-4">
      {label ? (
        <Text
          fontWeight="SemiBold"
          className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        {...props}
        {...field}
        className={`border rounded-xl px-4 py-3 text-base text-gray-900 bg-white ${
          error ? "border-danger" : "border-gray-200"
        }`}
        style={[{ fontFamily: "Cairo" }, style]}
        placeholderTextColor={COLORS.gray400}
      />
      {error ? <Text className="text-sm text-danger mt-1">{error}</Text> : null}
    </View>
  );
}
