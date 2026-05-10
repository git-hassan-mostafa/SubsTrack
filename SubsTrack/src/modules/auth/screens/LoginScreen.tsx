import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { useAuthStore } from "../store/authStore";

export function LoginScreen() {
  const { t } = useTranslation();
  const { login, loading, error, clearError } = useAuthStore();

  const [tenantName, setTenantName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const isAccountNotConfigured = error === "account_not_configured";
  const fieldError = error && !isAccountNotConfigured ? error : null;

  async function handleLogin() {
    if (!tenantName.trim() || !username.trim() || !password) return;
    await login(username, tenantName, password);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 px-6 justify-center">
          {/* Brand logo */}
          <View className="flex-row items-center mb-10">
            <View className="w-11 h-11 bg-primary rounded-2xl items-center justify-center me-3">
              <Text className="text-white text-xl">📅</Text>
            </View>
            <Text className="text-xl font-bold text-gray-900">SubsTrack</Text>
          </View>

          <Text className="text-3xl font-bold text-gray-900 mb-2">
            {t("auth.welcome_back")}
          </Text>
          <Text className="text-base text-gray-500 mb-8">
            {t("auth.welcome_description")}
          </Text>

          {isAccountNotConfigured ? (
            <ErrorBanner
              message={t("auth.account_not_configured")}
              onDismiss={clearError}
            />
          ) : null}

          <Input
            label={t("auth.workspace_id")}
            value={tenantName}
            onChangeText={(v) => {
              clearError();
              setTenantName(v);
            }}
            placeholder="acme-isp"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label={t("auth.username")}
            value={username}
            onChangeText={(v) => {
              clearError();
              setUsername(v);
            }}
            placeholder={t("auth.username_placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label={t("auth.password")}
            value={password}
            onChangeText={(v) => {
              clearError();
              setPassword(v);
            }}
            placeholder={t("auth.password_placeholder")}
            secureTextEntry
            error={fieldError}
          />

          <Button
            label={t("auth.sign_in")}
            onPress={handleLogin}
            loading={loading}
            disabled={!tenantName.trim() || !username.trim() || !password}
            fullWidth
          />

          <View className="flex-row justify-center mt-5">
            <Text className="text-sm text-gray-400">
              {t("auth.lost_workspace_id")}{" "}
            </Text>
            <Text className="text-sm text-primary font-semibold">
              {t("auth.get_help")}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
