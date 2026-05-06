import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLanguageStore, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/src/core/i18n/languageStore';
import { useAuthStore } from '@/src/modules/auth/store/authStore';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  ar: 'العربية',
};

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();
  const { logout } = useAuthStore();

  function handleLanguageSelect(lang: SupportedLanguage) {
    if (lang === language) return;
    Alert.alert(
      t('settings.language_section'),
      t('settings.restart_notice'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'OK', onPress: () => setLanguage(lang) },
      ],
    );
  }

  function handleLogout() {
    Alert.alert(
      t('settings.logout'),
      t('settings.logout_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: () => logout() },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 py-4 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">{t('settings.title')}</Text>
      </View>

      <View className="mt-6 mx-4">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t('settings.language_section')}
        </Text>
        <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {SUPPORTED_LANGUAGES.map((lang, index) => (
            <Pressable
              key={lang}
              onPress={() => handleLanguageSelect(lang)}
              className={`flex-row items-center justify-between px-4 py-4 ${
                index < SUPPORTED_LANGUAGES.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <Text className="text-base text-gray-900">{LANGUAGE_LABELS[lang]}</Text>
              {lang === language ? (
                <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
                  <Text className="text-white text-xs font-bold">✓</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>

      <View className="mt-6 mx-4">
        <Pressable
          onPress={handleLogout}
          className="bg-white rounded-lg border border-gray-200 px-4 py-4 flex-row items-center justify-center"
        >
          <Text className="text-base font-medium text-danger">{t('settings.logout')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
