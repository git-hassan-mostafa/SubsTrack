import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./core/i18n/setup";
import "./index.css";
import "@shared/shared/styles/scrollbars.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
