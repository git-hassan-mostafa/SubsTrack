import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { useSignupSlice } from "@/src/state/hooks/useSignupSlice";
import { getStore } from "@/src/state/globalStore";
import { StepIndicator } from "../components/StepIndicator";

export function SignupAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tenantCode = useSignupSlice((s) => s.tenantCode);
  const adminUserName = useSignupSlice((s) => s.adminUserName);
  const adminFullName = useSignupSlice((s) => s.adminFullName);
  const adminPassword = useSignupSlice((s) => s.adminPassword);
  const confirmPassword = useSignupSlice((s) => s.confirmPassword);
  const error = useSignupSlice((s) => s.error);
  const loading = useSignupSlice((s) => s.loading);
  const setAccount = useSignupSlice((s) => s.setAccount);
  const submit = useSignupSlice((s) => s.submit);
  const clearError = useSignupSlice((s) => s.clearError);
  const reset = useSignupSlice((s) => s.reset);

  const canSubmit =
    adminUserName.trim().length > 0 &&
    adminFullName.trim().length > 0 &&
    adminPassword.length >= 8 &&
    confirmPassword.length >= 8;

  async function handleCreate() {
    if (!canSubmit) return;
    const credentials = await submit();
    if (!credentials) return;
    // Edge function succeeded — try to auto-login. If the JWT/profile lookup
    // races and login fails, fall back to the login screen with the workspace
    // code pre-filled rather than leaving the user staring at this form.
    await getStore()
      .getState()
      .auth.login(credentials.username, credentials.tenantCode, credentials.password);

    const auth = getStore().getState().auth;
    reset();
    if (!auth.user) {
      router.replace("/(auth)/login" as Href);
    }
    // On success the root (app)/_layout reacts to authSlice.user and routes
    // into the app — no explicit navigation needed here.
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
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
            <StepIndicator current={2} total={2} />

            {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

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
                setAccount({ adminUserName: v.toLowerCase().replace(/\s+/g, "") })
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
        </ScrollView>

        <View className="flex-row items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
          <Button
            label={t("common.back")}
            onPress={() => router.back()}
            variant="ghost"
          />
          <Button
            label={t("signup.create_workspace")}
            onPress={handleCreate}
            loading={loading}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
