import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CacheProvider } from "@emotion/react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { RouterProvider } from "react-router";
import { createAppTheme } from "@/app/theme/theme";
import { styleCacheFor } from "@/app/theme/styleCache";
import { router } from "@/app/routes/router";
import { ConfirmDialogHost } from "@/shared/components/ConfirmDialogHost";
import { currentLanguage } from "@/core/i18n/language";
import { PICKERS_TEXT } from "@/core/i18n/pickersText";
import { DAYJS_LOCALE } from "@/core/i18n/setup";

export function App() {
  const { i18n } = useTranslation();
  const language = currentLanguage(i18n.language);
  const theme = useMemo(() => createAppTheme(language), [language]);

  return (
    <CacheProvider value={styleCacheFor(language)}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          adapterLocale={DAYJS_LOCALE[language]}
          localeText={PICKERS_TEXT[language]}
        >
          <RouterProvider router={router} />
          <ConfirmDialogHost />
        </LocalizationProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}
