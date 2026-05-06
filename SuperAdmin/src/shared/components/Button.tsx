import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Variant = 'primary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, fullWidth }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? '#374151' : '#ffffff'} size="small" />
      ) : (
        <Text style={[styles.label, variant === 'ghost' && styles.labelGhost]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#0a7ea4' },
  danger: { backgroundColor: '#ef4444' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#d1d5db' },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  label: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  labelGhost: { color: '#374151' },
});
