import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GRAPH_VERSION } from "@edge/whatsapp/rules";
import { useConnectStore } from "@shared/modules/whatsapp/state/connectStore";
import { isSignupPin, readSignupEvent, type SignupDetails } from "@shared/modules/whatsapp/utils/embeddedSignup";
import { useOptionSlice, useWhatsAppSignupOptions } from "@shared/state/hooks/useOptionSlice";

const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
const SDK_SCRIPT_ID = "facebook-jssdk";
const DETAILS_WAIT_MS = 10_000;

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

// Browser-only Meta Embedded Signup: the code and the account details race in.
export function useEmbeddedSignup(s: string | null) {
  const { t } = useTranslation();
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
      const signup = readSignupEvent(event.origin, event.data);
      if (!signup) return;
      if (signup.kind === "no_number") {
        settleWithError(t("whatsapp.connect_page.no_number"));
      } else if (signup.kind === "finished") {
        pending.current.details = signup.details;
        trySubmit();
      } else {
        settleWithError(
          signup.detail
            ? t("whatsapp.connect_page.meta_error", { message: signup.detail })
            : t("whatsapp.connect_page.cancelled"),
        );
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

  return {
    configured: !!appId && !!configId,
    optionsLoading: optionsLoading && !appId,
    sdkReady,
    phase,
    error,
    result,
    launch,
    submitPin: (pin: string) => (s && isSignupPin(pin) ? submitPin(s, pin) : Promise.resolve()),
  };
}
