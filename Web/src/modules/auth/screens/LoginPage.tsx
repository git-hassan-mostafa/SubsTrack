import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";

const ACCOUNT_NOT_CONFIGURED = "account_not_configured";

type FormState = {
  tenantCode: string;
  username: string;
  password: string;
};

// Empty fields are refused by AuthService.login, so the button is never disabled.
export function LoginPage() {
  const { t } = useTranslation();
  const login = useAuthSlice((s) => s.login);
  const error = useAuthSlice((s) => s.error);
  const clearError = useAuthSlice((s) => s.clearError);
  const [form, setForm] = useState<FormState>({
    tenantCode: "",
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => clearError, [clearError]);

  const message =
    error === ACCOUNT_NOT_CONFIGURED ? t("auth.account_not_configured") : error;

  function update(field: keyof FormState, value: string) {
    clearError();
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    await login(form.username, form.tenantCode, form.password);
    setSubmitting(false);
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
      }}
    >
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
          <Box component="img" src="/logo.png" alt="" sx={{ width: 32, height: 32 }} />
          <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
            {t("auth.title")}
          </Typography>
        </Stack>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {t("auth.welcome_back")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t("auth.welcome_description")}
        </Typography>

        <Box component="form" noValidate onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <ErrorBanner message={message} onDismiss={clearError} />
            <TextField
              label={t("auth.organization_id")}
              placeholder={t("auth.organization_id_placeholder")}
              value={form.tenantCode}
              onChange={(e) => update("tenantCode", e.target.value)}
              autoComplete="organization"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label={t("auth.username")}
              placeholder={t("auth.username_placeholder")}
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              fullWidth
            />
            <TextField
              label={t("auth.password")}
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        aria-label={t(
                          showPassword ? "web.hide_password" : "web.show_password",
                        )}
                        onClick={() => setShowPassword((shown) => !shown)}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              loading={submitting}
              fullWidth
            >
              {t("auth.sign_in")}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
