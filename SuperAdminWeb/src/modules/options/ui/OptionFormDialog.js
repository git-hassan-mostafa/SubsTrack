import { openDialog } from "../../../shared/ui/Dialog.js";
import { ErrorBanner } from "../../../shared/ui/ErrorBanner.js";
import { bind, button, h, watch } from "../../../shared/ui/dom.js";
import { textField } from "../../../shared/ui/fields.js";
import { clearFormError, createOption, optionStore, updateOption } from "../store/optionStore.js";

export function openOptionForm(option) {
  const isEditing = !!option;
  const submitLabel = isEditing ? "Save changes" : "Create option";
  const stops = [];
  clearFormError();
  const dialog = openDialog({
    title: isEditing ? `Edit ${option.key}` : "New option",
    onClose: () => {
      stops.forEach((stop) => stop());
      clearFormError();
    },
  });

  const key = textField({
    label: "Key",
    value: option?.key ?? "",
    placeholder: "e.g. LiraRate",
    readOnly: isEditing,
    hint: isEditing ? "The key cannot be changed after creation." : null,
    onFocus: clearFormError,
  });
  const value = textField({
    label: "Value",
    value: option?.value ?? "",
    placeholder: "e.g. 89000",
    onFocus: clearFormError,
  });
  const description = textField({
    label: "Description (optional)",
    value: option?.description ?? "",
    placeholder: "What this option controls",
    multiline: true,
    onFocus: clearFormError,
  });
  const bannerBox = h("div");
  const submit = button(submitLabel, "btn-primary btn-block", null, "submit");

  async function handleSubmit(event) {
    event.preventDefault();
    if (optionStore.getState().saving) return;
    const input = {
      key: key.input.value,
      value: value.input.value,
      description: description.input.value,
    };
    const ok = isEditing ? await updateOption(option.id, input) : await createOption(input);
    if (ok) dialog.close();
  }

  dialog.body.append(
    h(
      "form",
      { class: "form", onSubmit: handleSubmit },
      bannerBox,
      key.element,
      value.element,
      description.element,
      h("div", { class: "form-submit" }, submit),
    ),
  );

  stops.push(
    bind(optionStore, bannerBox, (s) => [s.formError], (error) => ErrorBanner(error, clearFormError)),
    watch(optionStore, (s) => [s.saving], (saving) => {
      submit.disabled = saving;
      submit.textContent = saving ? "Saving…" : submitLabel;
    }),
  );
  (isEditing ? value : key).input.focus();
}
