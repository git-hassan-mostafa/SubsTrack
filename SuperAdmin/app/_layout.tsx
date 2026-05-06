import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { LoadingScreen } from '@/src/shared/components/LoadingScreen';
import { Button } from '@/src/shared/components/Button';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { ready, error, initialize, retry } = useAuthStore();

  useEffect(() => {
    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return <LoadingScreen message="Signing in..." />;
  }

  if (error) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Sign-in failed</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Button label="Retry" onPress={retry} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
    gap: 12,
  },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  errorMessage: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
