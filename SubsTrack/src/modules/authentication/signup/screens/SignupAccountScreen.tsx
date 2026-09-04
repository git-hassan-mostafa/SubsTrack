import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { useSignupStore } from "@/src/modules/authentication/signup/state/signupStore";
import { getStore } from "@/src/state/globalStore";
import { StepIndicator } from "../components/StepIndicator";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";

export function SignupAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tenantCode = useSignupStore((s) => s.tenantCode);
  const adminUserName = useSignupStore((s) => s.adminUserName);
  const adminFullName = useSignupStore((s) => s.adminFullName);
  const adminPassword = useSignupStore((s) => s.adminPassword);
  const confirmPassword = useSignupStore((s) => s.confirmPassword);
  const error = useSignupStore((s) => s.error);
  const loading = useSignupStore((s) => s.loading);
  const setAccount = useSignupStore((s) => s.setAccount);
  const submit = useSignupStore((s) => s.submit);
  const clearError = useSignupStore((s) => s.clearError);
  const reset = useSignupStore((s) => s.reset);

  const canSubmit =
    adminUserName.trim().length > 0 &&
    adminFullName.trim().length > 0 &&
    adminPassword.length >= 8 &&
    confirmPassword.length >= 8;

  async function handleCreate() {
    if (!canSubmit) return;
    const credentials = await submit();
    if (!credentials) return;
    await getStore()
      .getState()
      .auth.login(
        credentials.username,
        credentials.tenantCode,
        credentials.password,
      );

    const auth = getStore().getState().auth;
    reset();
    if (!auth.user) {
      router.replace("/(auth)/login" as Href);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ResponsiveContainer className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-1 px-6 py-8">
              <Text fontWeight="Bold" className="text-3xl text-gray-900 mb-2">
                {t("signup.account_title")}
              </Text>
              <Text className="text-base text-gray-500 mb-6">
                {t("signup.account_subtitle", { tenantCode })}
              </Text>

              {error ? (
                <ErrorBanner message={error} onDismiss={clearError} />
              ) : null}

              <Input
                label={t("signup.fullname_label")}
                value={adminFullName}
                onChangeText={(v) => setAccount({ adminFullName: v })}
                placeholder={t("signup.fullname_placeholder")}
                autoCorrect={false}
              />

              <Input
                label={t("signup.username_label")}
                value={adminUserName}
                onChangeText={(v) =>
                  setAccount({
                    adminUserName: v.toLowerCase().replace(/\s+/g, ""),
                  })
                }
                placeholder={t("signup.username_placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Input
                label={t("signup.password_label")}
                value={adminPassword}
                onChangeText={(v) => setAccount({ adminPassword: v })}
                placeholder={t("signup.password_placeholder")}
                secureTextEntry
              />

              <Input
                label={t("signup.confirm_password_label")}
                value={confirmPassword}
                onChangeText={(v) => setAccount({ confirmPassword: v })}
                placeholder={t("signup.confirm_password_placeholder")}
                secureTextEntry
              />
            </View>
            <StepIndicator current={2} total={2} />
          </ScrollView>

          <View className="flex-row items-center justify-between px-6 py-8 border-t border-gray-100 bg-white">
            <Button
              label={t("common.back")}
              onPress={() => router.back()}
              variant="ghost"
            />
            <Button
              label={t("signup.create_organization")}
              onPress={handleCreate}
              loading={loading}
              disabled={!canSubmit}
            />
          </View>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
