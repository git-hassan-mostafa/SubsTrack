import { ErrorBanner } from "../../../shared/ui/ErrorBanner.js";
import { bind, button, h } from "../../../shared/ui/dom.js";
import { textField } from "../../../shared/ui/fields.js";
import { clearNotice, sessionStore, submitKey } from "../store/sessionStore.js";

export function KeyGate() {
  const key = textField({
    label: "Paste service role key",
    type: "password",
    placeholder: "eyJ…",
    hint: "Kept only in this browser (localStorage), never in a file. Use Forget key when you are done.",
    onFocus: clearNotice,
  });
  const bannerBox = h("div");
  const handleSubmit = (event) => {
    event.preventDefault();
    submitKey(key.input.value);
  };
  const element = h(
    "div",
    { class: "gate" },
    h(
      "form",
      { class: "gate-card", onSubmit: handleSubmit },
      h("h1", {}, "Sijil admin"),
      bannerBox,
      key.element,
      button("Connect", "btn-primary btn-block", null, "submit"),
    ),
  );
  const stop = bind(sessionStore, bannerBox, (s) => [s.notice], (notice) => ErrorBanner(notice, clearNotice));
  queueMicrotask(() => key.input.focus());
  return { element, dispose: stop };
}
