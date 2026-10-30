import { h } from "./dom.js";

// The input owns the typed text; `onInput` only mirrors it into the form draft.
export function textField({
  label,
  value = "",
  type = "text",
  placeholder,
  readOnly,
  multiline = false,
  inputMode,
  autocomplete = "off",
  hint,
  onInput,
  onFocus,
}) {
  const input = h(multiline ? "textarea" : "input", {
    class: "input",
    type: multiline ? null : type,
    rows: multiline ? 3 : null,
    value,
    placeholder,
    readOnly,
    inputMode,
    autocomplete,
    spellcheck: false,
    onInput: (event) => onInput?.(event.target.value),
    onFocus,
  });
  const error = h("span", { class: "field-error", hidden: true });
  const element = h(
    "label",
    { class: "field" },
    h("span", { class: "field-label" }, label),
    input,
    hint ? h("span", { class: "field-hint" }, hint) : null,
    error,
  );
  return {
    element,
    input,
    setValue(next) {
      input.value = next;
    },
    setError(message) {
      error.textContent = message ?? "";
      error.hidden = !message;
      input.classList.toggle("input-invalid", !!message);
    },
  };
}

export function switchRow({ label, hint, checked, onChange }) {
  const input = h("input", {
    type: "checkbox",
    role: "switch",
    class: "switch",
    checked,
    onChange: (event) => onChange(event.target.checked),
  });
  return h(
    "label",
    { class: "switch-row" },
    h("span", {}, h("span", { class: "switch-label" }, label), h("span", { class: "field-hint" }, hint)),
    input,
  );
}

export function chip({ label, sublabel, selected, onClick }) {
  return h(
    "button",
    { type: "button", class: selected ? "chip chip-selected" : "chip", "aria-pressed": String(selected), onClick },
    h("span", { class: "chip-label" }, label),
    sublabel ? h("span", { class: "chip-sub" }, sublabel) : null,
  );
}
