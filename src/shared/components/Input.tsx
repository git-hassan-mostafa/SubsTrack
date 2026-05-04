import { Text, TextInput, TextInputProps, View } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      ) : null}
      <TextInput
        {...props}
        className={`border rounded-lg px-4 py-3 text-base text-gray-900 bg-white ${
          error ? 'border-danger' : 'border-gray-300'
        }`}
        placeholderTextColor="#9ca3af"
      />
      {error ? (
        <Text className="text-sm text-danger mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
