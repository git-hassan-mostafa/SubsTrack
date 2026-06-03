import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useSignupStore } from "../store/signupStore";

export function SignupWorkspaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    name,
    tenantCode,
    error,
    checkingCode,
    setWorkspace,
    validateAndCheckCode,
    clearError,
  } = useSignupStore();

  const canSubmit = name.trim().length > 0 && tenantCode.trim().length > 0;

  async function handleNext() {
    if (!canSubmit) return;
    const ok = await validateAndCheckCode();
    if (ok) router.push("/(auth)/signup-account" as Href);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-6 py-8">
            <PressableOpacity onPress={() => router.back()} className="mb-6">
              <Text className="text-sm text-primary">{t("common.back")}</Text>
            </PressableOpacity>

            <Text fontWeight="Bold" className="text-3xl text-gray-900 mb-2">
              {t("signup.workspace_title")}
            </Text>
            <Text className="text-base text-gray-500 mb-2">
              {t("signup.workspace_subtitle")}
            </Text>
            <Text className="text-xs text-gray-400 mb-8">
              {t("signup.step_label", { current: 1, total: 2 })}
            </Text>

            {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

            <Input
              label={t("signup.workspace_name_label")}
              value={name}
              onChangeText={(v) => setWorkspace({ name: v })}
              placeholder={t("signup.workspace_name_placeholder")}
              autoCorrect={false}
            />

            <Input
              label={t("signup.tenant_code_label")}
              value={tenantCode}
              onChangeText={(v) =>
                setWorkspace({ tenantCode: v.toLowerCase().replace(/\s+/g, "") })
              }
              placeholder={t("signup.tenant_code_placeholder")}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-xs text-gray-400 -mt-2 mb-6">
              {t("signup.tenant_code_hint")}
            </Text>

            <Button
              label={t("signup.next")}
              onPress={handleNext}
              loading={checkingCode}
              disabled={!canSubmit}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
