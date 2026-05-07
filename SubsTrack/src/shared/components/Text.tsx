import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { useLanguageStore } from '@/src/core/i18n/languageStore';

export function Text({ style, ...props }: TextProps) {
  const { language } = useLanguageStore();
  if (language !== 'ar') return <RNText style={style} {...props} />;
  return <RNText style={[styles.arabic, StyleSheet.flatten(style) ?? {}]} {...props} />;
}

const styles = StyleSheet.create({
  arabic: { fontFamily: 'Cairo' },
});
