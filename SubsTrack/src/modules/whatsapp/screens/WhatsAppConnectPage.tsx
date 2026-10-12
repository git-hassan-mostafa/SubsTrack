import { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { useEmbeddedSignup } from "@shared/modules/whatsapp/hooks/useEmbeddedSignup";
import { CONNECT_FROM_WEB } from "@shared/modules/whatsapp/utils/constants";
import { isSignupPin, SIGNUP_PIN_LENGTH } from "@shared/modules/whatsapp/utils/embeddedSignup";

const APP_RETURN_URL = "sijil://";
const WEB_RETURN_ROUTE = "/(app)/(tabs)/admin/whatsapp" as Href;

// Web-only: Embedded Signup needs the Facebook JS SDK, never the native app.
export function WhatsAppConnectPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { s, from } = useLocalSearchParams<{ s?: string; from?: string }>();
  const fromWeb = from === CONNECT_FROM_WEB;
  const signup = useEmbeddedSignup(s ?? null);
  const { phase, error, result } = signup;
  const [pin, setPin] = useState("");

  if (!s) {
    return <Message title={t("whatsapp.connect_page.title")} body={t("whatsapp.connect_page.no_link")} />;
  }
  if (signup.optionsLoading) {
    return <Message title={t("whatsapp.connect_page.title")} loading />;
  }
  if (!signup.configured) {
    return <Message title={t("whatsapp.connect_page.title")} body={t("whatsapp.errors.not_configured")} />;
  }

  if (phase === "done") {
    return (
      <Message
        title={t("whatsapp.connect_page.done_title")}
        body={t("whatsapp.connect_page.done_body", {
          number: result?.displayPhoneNumber ?? "",
          name: result?.verifiedName ?? "",
        })}
      >
        <Button
          label={t("whatsapp.connect_page.return_to_app")}
          onPress={() =>
            fromWeb
              ? router.replace(WEB_RETURN_ROUTE)
              : void Linking.openURL(APP_RETURN_URL)
          }
          fullWidth
        />
        {fromWeb ? null : (
          <Text className="text-xs text-gray-500 text-center mt-3">
            {t("whatsapp.connect_page.close_tab")}
          </Text>
        )}
      </Message>
    );
  }

  return (
    <Message title={t("whatsapp.connect_page.title")} body={t("whatsapp.connect_page.intro")}>
      {error ? <ErrorBanner message={error} /> : null}
      {phase === "working" ? (
        <View className="items-center py-4">
          <ActivityIndicator color={COLORS.primary} />
          <Text className="text-sm text-gray-600 mt-2">{t("whatsapp.connect_page.working")}</Text>
        </View>
      ) : phase === "needs_pin" ? (
        <View className="gap-3">
          <Input
            label={t("whatsapp.connect_page.pin_label")}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={SIGNUP_PIN_LENGTH}
            secureTextEntry
          />
          <Button
            label={t("whatsapp.connect_page.pin_submit")}
            onPress={() => void signup.submitPin(pin)}
            disabled={!isSignupPin(pin)}
            fullWidth
          />
        </View>
      ) : (
        <View className="gap-3">
          {[1, 2, 3].map((step) => (
            <Text key={step} className="text-sm text-gray-700">
              {t(`whatsapp.connect_page.step_${step}`)}
            </Text>
          ))}
          <Button
            label={t("whatsapp.connect_page.start")}
            onPress={signup.launch}
            disabled={!signup.sdkReady}
            loading={!signup.sdkReady}
            fullWidth
          />
        </View>
      )}
    </Message>
  );
}

function Message({
  title,
  body,
  loading,
  children,
}: {
  title: string;
  body?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <View className={`${CARD_SURFACE} p-5 w-full max-w-lg self-center mt-8`}>
        <Text fontWeight="Bold" className="text-xl text-gray-900 mb-2">
          {title}
        </Text>
        {body ? <Text className="text-sm text-gray-600 mb-4">{body}</Text> : null}
        {loading ? <ActivityIndicator color={COLORS.primary} /> : null}
        {children}
      </View>
    </ScrollView>
  );
}
