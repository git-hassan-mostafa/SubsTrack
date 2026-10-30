import { h } from "./dom.js";

export function ErrorBanner(message, onDismiss) {
  if (!message) return null;
  return h(
    "div",
    { class: "banner", role: "alert" },
    h("span", { class: "banner-text" }, message),
    onDismiss
      ? h("button", { type: "button", class: "banner-close", "aria-label": "Dismiss", onClick: onDismiss }, "✕")
      : null,
  );
}

export function EmptyState(message, subMessage) {
  return h(
    "div",
    { class: "empty" },
    h("p", { class: "empty-title" }, message),
    subMessage ? h("p", { class: "muted" }, subMessage) : null,
  );
}
