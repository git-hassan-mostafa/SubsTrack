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
import { StepIndicator } from "../components/StepIndicator";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";

export function SignupOrganizationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const name = useSignupStore((s) => s.name);
  const tenantCode = useSignupStore((s) => s.tenantCode);
  const error = useSignupStore((s) => s.error);
  const checkingCode = useSignupStore((s) => s.checkingCode);
  const setOrganization = useSignupStore((s) => s.setOrganization);
  const validateAndCheckCode = useSignupStore((s) => s.validateAndCheckCode);
  const clearError = useSignupStore((s) => s.clearError);

  const canSubmit = name.trim().length > 0 && tenantCode.trim().length > 0;

  async function handleNext() {
    if (!canSubmit) return;
    const ok = await validateAndCheckCode();
    if (ok) router.push("/(auth)/signup-account" as Href);
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
                {t("signup.organization_title")}
              </Text>
              <Text className="text-base text-gray-500 mb-6">
                {t("signup.organization_subtitle")}
              </Text>

              {error ? (
                <ErrorBanner message={error} onDismiss={clearError} />
              ) : null}

              <Input
                label={t("signup.organization_name_label")}
                value={name}
                onChangeText={(v) => setOrganization({ name: v })}
                placeholder={t("signup.organization_name_placeholder")}
                autoCorrect={false}
              />

              <Input
                label={t("signup.tenant_code_label")}
                value={tenantCode}
                onChangeText={(v) =>
                  setOrganization({
                    tenantCode: v.toLowerCase().replace(/\s+/g, ""),
                  })
                }
                placeholder={t("signup.tenant_code_placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text className="text-xs text-gray-400 -mt-2 mb-6">
                {t("signup.tenant_code_hint")}
              </Text>
            </View>
            <StepIndicator current={1} total={2} />
          </ScrollView>

          <View className="flex-row items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
            <Button
              label={t("common.back")}
              onPress={() => router.back()}
              variant="ghost"
            />
            <Button
              label={t("signup.next")}
              onPress={handleNext}
              loading={checkingCode}
              disabled={!canSubmit}
            />
          </View>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
