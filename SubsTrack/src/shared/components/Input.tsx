import type { ReactNode } from "react";
import { TextInputProps, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { AppTextInput } from "@/src/shared/components/AppTextInput";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { FieldLabel } from "@/src/shared/components/FieldLabel";

interface InputProps extends Omit<TextInputProps, "value"> {
  value: string;
  label?: string;
  error?: string | null;
  sanitize?: (next: string) => string;
  expectedEcho?: (next: string) => string;
  trailing?: ReactNode;
}

export function Input({
  label,
  error,
  style,
  value,
  onChangeText,
  sanitize,
  expectedEcho,
  trailing,
  ...props
}: InputProps) {
  const field = useTextField(value, onChangeText, { sanitize, expectedEcho });
  return (
    <View className="mb-4">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View className="flex-row items-center gap-2">
        <AppTextInput
          {...props}
          {...field}
          containerClassName="flex-1"
          className={`border rounded-xl px-4 py-3 min-h-14 text-base text-gray-900 bg-white ${
            error ? "border-danger" : "border-gray-300"
          }`}
          style={style}
          placeholderTextColor={COLORS.gray400}
        />
        {trailing}
      </View>
      {error ? <Text className="text-sm text-danger mt-1">{error}</Text> : null}
    </View>
  );
}
