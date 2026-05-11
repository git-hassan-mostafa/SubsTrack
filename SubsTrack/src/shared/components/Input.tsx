import { TextInput, TextInputProps, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {label}
        </Text>
      ) : null}
      <TextInput
        {...props}
        className={`border rounded-xl px-4 py-3 text-base text-gray-900 bg-white ${
          error ? "border-danger" : "border-gray-200"
        }`}
        style={{ fontFamily: "Cairo" }}
        placeholderTextColor={COLORS.gray400}
      />
      {error ? <Text className="text-sm text-danger mt-1">{error}</Text> : null}
    </View>
  );
}
