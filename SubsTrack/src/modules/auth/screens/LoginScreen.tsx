import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import { useAuthStore } from '../store/authStore';

export function LoginScreen() {
  const { t } = useTranslation();
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
          <Text className="text-3xl font-bold text-gray-900 mb-2">{t('auth.title')}</Text>
          <Text className="text-base text-gray-500 mb-10">{t('auth.subtitle')}</Text>

          {isAccountNotConfigured ? (
            <ErrorBanner message={t('auth.account_not_configured')} onDismiss={clearError} />
          ) : null}

          <Input
            label={t('auth.workspace_id')}
            value={tenantId}
            onChangeText={(v) => { clearError(); setTenantId(v); }}
            placeholder={t('auth.workspace_id_placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label={t('auth.username')}
            value={username}
            onChangeText={(v) => { clearError(); setUsername(v); }}
            placeholder={t('auth.username_placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label={t('auth.password')}
            value={password}
            onChangeText={(v) => { clearError(); setPassword(v); }}
            placeholder={t('auth.password_placeholder')}
            secureTextEntry
            error={fieldError}
          />

          <Button
            label={t('auth.sign_in')}
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
