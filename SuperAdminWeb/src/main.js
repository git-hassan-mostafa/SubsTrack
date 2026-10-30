import "./styles/main.css";
import { AppShell } from "./app/AppShell.js";
import { setInvalidKeyHandler } from "./core/errors.js";
import { endSession, restoreSession, sessionStore } from "./modules/session/store/sessionStore.js";
import { KeyGate } from "./modules/session/ui/KeyGate.js";
import { closeAllDialogs } from "./shared/ui/Dialog.js";
import { watch } from "./shared/ui/dom.js";

const root = document.getElementById("app");
let view = null;

function show(connected) {
  view?.dispose();
  closeAllDialogs();
  view = connected ? AppShell() : KeyGate();
  root.replaceChildren(view.element);
}

setInvalidKeyHandler(endSession);
restoreSession();
watch(sessionStore, (s) => [s.connected], show);
