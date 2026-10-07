import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEmbeddedSignup } from "@shared/modules/whatsapp/hooks/useEmbeddedSignup";
import { CONNECT_FROM_PARAM, CONNECT_FROM_WEB } from "@shared/modules/whatsapp/utils/constants";
import { isSignupPin, SIGNUP_PIN_LENGTH } from "@shared/modules/whatsapp/utils/embeddedSignup";
import { useOptionSlice } from "@shared/state/hooks/useOptionSlice";

const APP_RETURN_URL = "sijil://";
const WEB_RETURN_PATH = "/admin/whatsapp";
const SIGNUP_STEPS = [1, 2, 3];

// Public: opened from a one-time link, before or without a signed-in session.
export function WhatsAppConnectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const s = params.get("s");
  const fromWeb = params.get(CONNECT_FROM_PARAM) === CONNECT_FROM_WEB;
  const fetchOptions = useOptionSlice((state) => state.fetchOptions);
  const [optionsRead, setOptionsRead] = useState(false);
  const signup = useEmbeddedSignup(s);
  const { phase, error, result } = signup;
  const [pin, setPin] = useState("");

  useEffect(() => {
    void fetchOptions().finally(() => setOptionsRead(true));
  }, [fetchOptions]);

  const title = t("whatsapp.connect_page.title");

  if (!s) return <ConnectCard title={title} body={t("whatsapp.connect_page.no_link")} />;
  if (!signup.configured) {
    return optionsRead ? (
      <ConnectCard title={title} body={t("whatsapp.errors.not_configured")} />
    ) : (
      <ConnectCard title={title}>
        <CircularProgress aria-label={t("web.loading")} sx={{ alignSelf: "center" }} />
      </ConnectCard>
    );
  }

  if (phase === "done") {
    return (
      <ConnectCard
        title={t("whatsapp.connect_page.done_title")}
        body={t("whatsapp.connect_page.done_body", {
          number: result?.displayPhoneNumber ?? "",
          name: result?.verifiedName ?? "",
        })}
      >
        <Button
          variant="contained"
          onClick={() =>
            fromWeb ? void navigate(WEB_RETURN_PATH, { replace: true }) : window.location.assign(APP_RETURN_URL)
          }
        >
          {t("whatsapp.connect_page.return_to_app")}
        </Button>
        {fromWeb ? null : (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            {t("whatsapp.connect_page.close_tab")}
          </Typography>
        )}
      </ConnectCard>
    );
  }

  return (
    <ConnectCard title={title} body={t("whatsapp.connect_page.intro")}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {phase === "working" ? (
        <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
          <CircularProgress aria-hidden />
          <Typography variant="body2" color="text.secondary">
            {t("whatsapp.connect_page.working")}
          </Typography>
        </Stack>
      ) : phase === "needs_pin" ? (
        <Stack
          component="form"
          spacing={2}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void signup.submitPin(pin);
          }}
        >
          <TextField
            label={t("whatsapp.connect_page.pin_label")}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            type="password"
            autoComplete="one-time-code"
            slotProps={{ htmlInput: { inputMode: "numeric", maxLength: SIGNUP_PIN_LENGTH } }}
            autoFocus
          />
          <Button type="submit" variant="contained" disabled={!isSignupPin(pin)}>
            {t("whatsapp.connect_page.pin_submit")}
          </Button>
        </Stack>
      ) : (
        <>
          <Stack component="ol" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
            {SIGNUP_STEPS.map((step) => (
              <Typography key={step} component="li" variant="body2">
                {t(`whatsapp.connect_page.step_${step}`)}
              </Typography>
            ))}
          </Stack>
          <Button variant="contained" onClick={signup.launch} loading={!signup.sdkReady}>
            {t("whatsapp.connect_page.start")}
          </Button>
        </>
      )}
    </ConnectCard>
  );
}

function ConnectCard({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", px: 2, py: 4 }}
    >
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 520, p: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {body ? <Typography color="text.secondary">{body}</Typography> : null}
          {children}
        </Stack>
      </Paper>
    </Box>
  );
}
