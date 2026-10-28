import { useState } from "react";
import { Image, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useSignInHelp } from "@shared/modules/authentication/auth/hooks/useSignInHelp";
import { useLegalLinks } from "@shared/state/hooks/useOptionSlice";
import { openUrl } from "@/src/shared/lib/openUrl";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";

const BRAND_LOGO = require("@/assets/images/icon-web-transparent.png");

// sized by style: web Image ignores className and width props (gotcha #172)
const BRAND_LOGO_SIZE = { width: 28, height: 28 };

type FormState = {
  tenantName: string;
  username: string;
  password: string;
};

export function LoginScreen() {
  const { t } = useTranslation();
  const login = useAuthSlice((s) => s.login);
  const error = useAuthSlice((s) => s.error);
  const clearError = useAuthSlice((s) => s.clearError);
  const { signInHelpUrl, newBusinessUrl } = useSignInHelp();
  const legal = useLegalLinks();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    tenantName: "",
    username: "",
    password: "",
  });

  const isAccountNotConfigured = error === "account_not_configured";
  const fieldError = error && !isAccountNotConfigured ? error : null;

  async function handleLogin() {
    if (!form.tenantName.trim() || !form.username.trim() || !form.password)
      return;
    setLoading(true);
    await login(form.username, form.tenantName, form.password);
    setLoading(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        <ResponsiveContainer className="flex-1">
          <View className="px-6 py-8">
            <Text fontWeight="Bold" className="text-3xl text-gray-900 mb-2">
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
              label={t("auth.organization_id")}
              value={form.tenantName}
              onChangeText={(v) => {
                clearError();
                setForm((prev) => ({ ...prev, tenantName: v }));
              }}
              placeholder="acme-isp"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label={t("auth.username")}
              value={form.username}
              onChangeText={(v) => {
                clearError();
                setForm((prev) => ({ ...prev, username: v }));
              }}
              placeholder={t("auth.username_placeholder")}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label={t("auth.password")}
              value={form.password}
              onChangeText={(v) => {
                clearError();
                setForm((prev) => ({ ...prev, password: v }));
              }}
              placeholder={t("auth.password_placeholder")}
              secureTextEntry
              error={fieldError}
            />

            <Button
              label={t("auth.sign_in")}
              onPress={handleLogin}
              loading={loading}
              disabled={
                !form.tenantName.trim() ||
                !form.username.trim() ||
                !form.password
              }
              fullWidth
            />

            <View className="items-center mt-5">
              <Text className="text-sm text-gray-500 text-center">
                {t("auth.forgot_password")}
              </Text>
              <Text className="text-sm text-gray-400 text-center mt-1">
                {t("auth.staff_reset_hint")}
              </Text>
              {signInHelpUrl ? (
                <Text
                  fontWeight="SemiBold"
                  className="text-sm text-primary mt-2"
                  onPress={() => void openUrl(signInHelpUrl)}
                >
                  {t("auth.get_help")}
                </Text>
              ) : null}
            </View>

            {newBusinessUrl ? (
              <View className="flex-row justify-center mt-6">
                <Text className="text-sm text-gray-400">
                  {t("auth.new_business")}{" "}
                </Text>
                <Text
                  fontWeight="SemiBold"
                  className="text-sm text-primary"
                  onPress={() => void openUrl(newBusinessUrl)}
                >
                  {t("auth.contact_us")}
                </Text>
              </View>
            ) : null}

            {legal ? (
              <View className="flex-row justify-center mt-8">
                <Text
                  className="text-xs text-gray-500"
                  onPress={() => void openUrl(legal.terms)}
                >
                  {t("legal.terms")}
                </Text>
                <Text className="text-xs text-gray-400">{" · "}</Text>
                <Text
                  className="text-xs text-gray-500"
                  onPress={() => void openUrl(legal.privacy)}
                >
                  {t("legal.privacy")}
                </Text>
              </View>
            ) : null}
          </View>
        </ResponsiveContainer>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
