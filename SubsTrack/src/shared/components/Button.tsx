import { ActivityIndicator, Pressable, Text } from 'react-native';

type Variant = 'primary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, { container: string; text: string }> = {
  primary: { container: 'bg-primary', text: 'text-white' },
  danger:  { container: 'bg-danger',  text: 'text-white' },
  ghost:   { container: 'bg-transparent border border-gray-300', text: 'text-gray-700' },
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, fullWidth }: ButtonProps) {
  const styles = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`rounded-xl py-3.5 px-6 items-center justify-center ${styles.container} ${fullWidth ? 'w-full' : ''} ${isDisabled ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? '#374151' : '#ffffff'} size="small" />
      ) : (
        <Text className={`text-base font-semibold ${styles.text}`}>{label}</Text>
      )}
    </Pressable>
  );
}
