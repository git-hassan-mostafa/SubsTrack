import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { useOptionSlice, useWhatsAppSignupOptions } from "@/src/state/hooks/useOptionSlice";
import { GRAPH_VERSION } from "@/supabase/functions/_shared/whatsapp/rules";
import { useConnectStore } from "../state/connectStore";
import { CONNECT_FROM_WEB } from "../utils/constants";

const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
const SDK_SCRIPT_ID = "facebook-jssdk";
const DETAILS_WAIT_MS = 10_000;
const APP_RETURN_URL = "sijil://";
const WEB_RETURN_ROUTE = "/(app)/(tabs)/admin/whatsapp" as Href;
const NO_NUMBER_EVENT = "FINISH_ONLY_WABA";

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
}

interface FacebookSdk {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
}

interface SignupDetails {
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  flow: "cloud" | "coexistence";
}

interface Pending {
  code: string | null;
  details: SignupDetails | null;
  settled: boolean;
}

type FacebookWindow = Window & { FB?: FacebookSdk; fbAsyncInit?: () => void };

function facebookWindow(): FacebookWindow {
  return window as FacebookWindow;
}

function useFacebookSdk(appId: string | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!appId) return;
    const w = facebookWindow();
    const init = () => {
      w.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      setReady(true);
    };
    if (w.FB) {
      init();
      return;
    }
    w.fbAsyncInit = init;
    if (!document.getElementById(SDK_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SDK_SCRIPT_ID;
      script.src = SDK_URL;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }
  }, [appId]);
  return ready;
}

// A bare endsWith("facebook.com") would also trust evilfacebook.com.
function isFacebookOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function parseSignupMessage(event: MessageEvent): { event: string; data: Record<string, string> } | null {
  if (!isFacebookOrigin(event.origin)) return null;
  try {
    const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    return payload?.type === "WA_EMBEDDED_SIGNUP"
      ? { event: String(payload.event ?? ""), data: payload.data ?? {} }
      : null;
  } catch {
    return null;
  }
}

// Web-only: Embedded Signup needs the Facebook JS SDK, never the native app.
export function WhatsAppConnectPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { s, from } = useLocalSearchParams<{ s?: string; from?: string }>();
  const fromWeb = from === CONNECT_FROM_WEB;
  const optionsLoading = useOptionSlice((state) => state.loading);
  const { appId, configId } = useWhatsAppSignupOptions();
  const sdkReady = useFacebookSdk(appId);
  const phase = useConnectStore((state) => state.phase);
  const error = useConnectStore((state) => state.error);
  const result = useConnectStore((state) => state.result);
  const complete = useConnectStore((state) => state.complete);
  const submitPin = useConnectStore((state) => state.submitPin);
  const fail = useConnectStore((state) => state.fail);
  const reset = useConnectStore((state) => state.reset);
  const [pin, setPin] = useState("");
  const pending = useRef<Pending>({ code: null, details: null, settled: false });

  const trySubmit = useCallback(() => {
    const { code, details, settled } = pending.current;
    if (settled || !code || !details || !s) return;
    pending.current.settled = true;
    void complete({ s, code, ...details });
  }, [complete, s]);

  const settleWithError = useCallback(
    (message: string) => {
      pending.current.settled = true;
      fail(message);
    },
    [fail],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = parseSignupMessage(event);
      if (!message) return;
      if (message.event === NO_NUMBER_EVENT) {
        settleWithError(t("whatsapp.connect_page.no_number"));
      } else if (message.event.startsWith("FINISH")) {
        pending.current.details = {
          wabaId: String(message.data.waba_id ?? ""),
          phoneNumberId: String(message.data.phone_number_id ?? ""),
          businessId: message.data.business_id ? String(message.data.business_id) : null,
          flow:
            message.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
              ? "coexistence"
              : "cloud",
        };
        trySubmit();
      } else if (message.event === "CANCEL" || message.event === "ERROR") {
        const detail = message.data.error_message;
        settleWithError(detail ? t("whatsapp.connect_page.meta_error", { message: detail }) : t("whatsapp.connect_page.cancelled"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [trySubmit, settleWithError, t]);

  useEffect(() => reset, [reset]);

  function launch() {
    const sdk = facebookWindow().FB;
    if (!sdk || !configId) return;
    reset();
    const attempt: Pending = { code: null, details: null, settled: false };
    pending.current = attempt;
    sdk.login(
      (response) => {
        const code = response.authResponse?.code ?? null;
        if (!code) return;
        attempt.code = code;
        trySubmit();
        setTimeout(() => {
          if (pending.current === attempt && !attempt.settled) {
            fail(t("whatsapp.connect_page.no_details"));
          }
        }, DETAILS_WAIT_MS);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  }

  if (!s) {
    return <Message title={t("whatsapp.connect_page.title")} body={t("whatsapp.connect_page.no_link")} />;
  }
  if (optionsLoading && !appId) {
    return <Message title={t("whatsapp.connect_page.title")} loading />;
  }
  if (!appId || !configId) {
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
            maxLength={6}
            secureTextEntry
          />
          <Button
            label={t("whatsapp.connect_page.pin_submit")}
            onPress={() => void submitPin(s, pin)}
            disabled={!/^\d{6}$/.test(pin)}
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
            onPress={launch}
            disabled={!sdkReady}
            loading={!sdkReady}
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
