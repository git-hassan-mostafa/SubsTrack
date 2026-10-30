import { button, h } from "./dom.js";

const openDialogs = new Set();

// Backdrop clicks never close it, so a half-typed form is never lost.
export function openDialog({ title, size = "form", onClose }) {
  const body = h("div", { class: "dialog-body" });
  const dialog = h(
    "dialog",
    { class: `dialog dialog-${size}` },
    h("header", { class: "dialog-header" }, h("h2", {}, title), button("Close", "btn-text", () => close())),
    body,
  );
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    openDialogs.delete(close);
    dialog.close();
    dialog.remove();
    onClose?.();
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  openDialogs.add(close);
  return { body, close };
}

export function closeAllDialogs() {
  for (const close of [...openDialogs]) close();
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", destructive = false }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const dialog = openDialog({ title, size: "compact", onClose: () => resolve(confirmed) });
    const confirm = () => {
      confirmed = true;
      dialog.close();
    };
    dialog.body.append(
      h("p", { class: "confirm-message" }, message),
      h(
        "div",
        { class: "actions" },
        button("Cancel", "btn-ghost", () => dialog.close()),
        button(confirmLabel, destructive ? "btn-danger" : "btn-primary", confirm),
      ),
    );
  });
}
