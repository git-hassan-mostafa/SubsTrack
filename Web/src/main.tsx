import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@shared/shared/styles/scrollbars.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getStore } from "@shared/state/globalStore";
import { configureWeb } from "@/platform/configureWeb";
import { initWebI18n } from "@/core/i18n/setup";
import { App } from "./App";

configureWeb();
await initWebI18n();
void getStore().getState().auth.restoreSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
