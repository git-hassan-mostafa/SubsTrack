import { StyleSheet, Text, View } from 'react-native';

interface EmptyStateProps {
  message: string;
  subMessage?: string;
}

export function EmptyState({ message, subMessage }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {subMessage ? <Text style={styles.subMessage}>{subMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  message: { fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center', marginBottom: 8 },
  subMessage: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
