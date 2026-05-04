import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import { useAuthStore } from '../store/authStore';

export function LoginScreen() {
  const { login, loading, error, clearError } = useAuthStore();

  const [tenantId, setTenantId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const isAccountNotConfigured = error === 'account_not_configured';
  const fieldError = error && !isAccountNotConfigured ? error : null;

  async function handleLogin() {
    if (!tenantId.trim() || !username.trim() || !password) return;
    await login(username, tenantId, password);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 px-6 justify-center">
          <Text className="text-3xl font-bold text-gray-900 mb-2">SubsTrack</Text>
          <Text className="text-base text-gray-500 mb-10">Sign in to your workspace</Text>

          {isAccountNotConfigured ? (
            <ErrorBanner
              message="Account not configured. Contact your administrator."
              onDismiss={clearError}
            />
          ) : null}

          <Input
            label="Workspace ID"
            value={tenantId}
            onChangeText={(t) => { clearError(); setTenantId(t); }}
            placeholder="your-workspace-id"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Username"
            value={username}
            onChangeText={(t) => { clearError(); setUsername(t); }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={(t) => { clearError(); setPassword(t); }}
            placeholder="••••••••"
            secureTextEntry
            error={fieldError}
          />

          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={!tenantId.trim() || !username.trim() || !password}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
