import { createStore } from "../../../core/createStore.js";
import { openDialog } from "../../../shared/ui/Dialog.js";
import { ErrorBanner } from "../../../shared/ui/ErrorBanner.js";
import { bind, button, h, watch } from "../../../shared/ui/dom.js";
import { chip, switchRow, textField } from "../../../shared/ui/fields.js";
import { fetchOptions, optionStore } from "../../options/store/optionStore.js";
import {
  DEFAULT_ALLOWANCE,
  DEFAULT_PRICE,
  allowanceError,
  allowancesAfterAccept,
  canSubmit,
  grantOf,
  initialDraft,
  isGrantValid,
  monthlyBillText,
  packageChoices,
  passwordHint,
  planAllowanceError,
  toCreateInput,
  toUpdateInput,
} from "../services/tenantForm.js";
import {
  acceptRequest,
  clearFormError,
  createTenant,
  declineRequest,
  tenantById,
  tenantStore,
  updateTenant,
} from "../store/tenantStore.js";
import { PRICING_MODELS, PRICING_MODEL_LABELS, shortDate } from "../utils/tenantDisplay.js";

export function openTenantForm(tenantId) {
  const isEditing = tenantId != null;
  const submitLabel = isEditing ? "Save changes" : "Create tenant";
  const draft = createStore(initialDraft(isEditing ? tenantById(tenantId) : null));
  const fields = {};
  const stops = [];
  clearFormError();
  void fetchOptions();
  const dialog = openDialog({
    title: isEditing ? "Edit tenant" : "Add tenant",
    size: "wide",
    onClose: () => {
      stops.forEach((stop) => stop());
      clearFormError();
    },
  });

  function field(key, props) {
    fields[key] = textField({
      ...props,
      value: draft.getState()[key],
      onInput: (value) => draft.setState({ [key]: value }),
      onFocus: clearFormError,
    });
    return fields[key].element;
  }

  function apply(patch) {
    draft.setState(patch);
    for (const [key, value] of Object.entries(patch)) fields[key]?.setValue(value);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const values = draft.getState();
    if (!canSubmit(values, isEditing) || tenantStore.getState().saving) return;
    const ok = isEditing
      ? await updateTenant(tenantId, toUpdateInput(values))
      : await createTenant(toCreateInput(values));
    if (ok) dialog.close();
  }

  async function handleAccept(event) {
    event.preventDefault();
    const pending = tenantById(tenantId)?.pendingRequest;
    const values = draft.getState();
    if (!pending || !isGrantValid(values) || tenantStore.getState().saving) return;
    const grant = grantOf(values);
    if (await acceptRequest(tenantId, pending.id, grant)) apply(allowancesAfterAccept(values, grant));
  }

  async function handleDecline() {
    const pending = tenantById(tenantId)?.pendingRequest;
    if (pending) await declineRequest(tenantId, pending.id);
  }

  const requestTitle = h("p", { class: "request-title" });
  const requestDate = h("p", { class: "request-date" });
  const accept = button("Accept", "btn-primary", null, "submit");
  const decline = button("Decline", "btn-danger-ghost", handleDecline);
  const requestBox = h(
    "form",
    { class: "request-box", hidden: true, onSubmit: handleAccept },
    requestTitle,
    requestDate,
    h(
      "div",
      { class: "grid-2" },
      field("granted", { label: "Grant customers", inputMode: "numeric" }),
      field("grantedPlans", { label: "Grant service lines", inputMode: "numeric" }),
    ),
    h("div", { class: "actions" }, decline, accept),
  );

  const bannerBox = h("div");
  const modelBox = h("div", { class: "chips" });
  const packageBox = h("div", { class: "chips" });
  const packageSection = h(
    "div",
    { class: "field" },
    h("span", { class: "field-label" }, "Package"),
    packageBox,
    h("span", { class: "field-hint" }, "Pick one to fill the fields below, or type your own."),
  );
  const allowanceSection = h(
    "div",
    { class: "grid-2" },
    field("allowance", { label: "Customer allowance", inputMode: "numeric", placeholder: DEFAULT_ALLOWANCE }),
    field("planAllowance", { label: "Service line allowance", inputMode: "numeric", placeholder: DEFAULT_ALLOWANCE }),
  );
  const billValue = h("strong");
  const submit = button(submitLabel, "btn-primary btn-block", null, "submit");

  const switches = [
    switchRow({
      label: "Active",
      hint: "Inactive tenants cannot log in",
      checked: draft.getState().active,
      onChange: (active) => draft.setState({ active }),
    }),
    switchRow({
      label: "WhatsApp messaging allowed",
      hint: "Lets this tenant connect its own WhatsApp number",
      checked: draft.getState().whatsappEnabled,
      onChange: (whatsappEnabled) => draft.setState({ whatsappEnabled }),
    }),
  ];
  const ownerSection = () => [
    h(
      "div",
      { class: "section-box" },
      h("p", { class: "strong" }, "Owner login"),
      h("p", { class: "muted" }, "An owner (super admin) account is created for this tenant."),
    ),
    field("adminUserName", { label: "Username", placeholder: "admin" }),
    field("adminFullName", { label: "Full name", placeholder: "e.g. John Smith" }),
    field("adminPassword", {
      label: "Password",
      type: "password",
      autocomplete: "new-password",
      placeholder: "At least 8 characters",
    }),
  ];

  const form = h(
    "form",
    { class: "form", onSubmit: handleSubmit },
    bannerBox,
    field("name", { label: "Tenant name", placeholder: "e.g. Acme ISP" }),
    isEditing
      ? null
      : field("tenantCode", {
          label: "Tenant code",
          placeholder: "e.g. acmeisp",
          hint: "Letters and numbers only. Used in every staff login; it cannot change later.",
        }),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Pricing"), modelBox),
    packageSection,
    allowanceSection,
    field("price", { label: "Price per service line (USD)", inputMode: "decimal", placeholder: DEFAULT_PRICE }),
    field("fixedPrice", { label: "Monthly price (USD)", inputMode: "decimal", placeholder: "e.g. 30" }),
    h("div", { class: "bill-row" }, h("span", {}, "Monthly bill"), billValue),
    isEditing ? switches : ownerSection(),
    h("div", { class: "form-submit" }, submit),
  );
  dialog.body.append(requestBox, form);

  const pickModel = (model) => {
    clearFormError();
    draft.setState({ pricingModel: model });
  };
  const pickPackage = (choice) => {
    clearFormError();
    apply(choice.fields);
  };

  stops.push(
    watch(tenantStore, (s) => [s.tenants.find((t) => t.id === tenantId)?.pendingRequest ?? null], (pending) => {
      requestBox.hidden = !pending;
      if (!pending) return;
      requestTitle.textContent = `Requested +${pending.requestedCount} customers, +${pending.requestedPlans} service lines`;
      requestDate.textContent = shortDate(pending.createdAt);
    }),
    watch([draft, tenantStore], (d, s) => [isGrantValid(d), s.saving], (valid, saving) => {
      accept.disabled = !valid || saving;
      decline.disabled = saving;
    }),
    bind(tenantStore, bannerBox, (s) => [s.formError], (error) => ErrorBanner(error, clearFormError)),
    bind(draft, modelBox, (d) => [d.pricingModel], (current) =>
      PRICING_MODELS.map((model) =>
        chip({ label: PRICING_MODEL_LABELS[model], selected: model === current, onClick: () => pickModel(model) }),
      ),
    ),
    watch(draft, (d) => [d.pricingModel], (model) => {
      packageSection.hidden = model !== "package";
      allowanceSection.hidden = model === "unlimited";
      fields.price.element.hidden = model !== "per_line";
      fields.fixedPrice.element.hidden = model === "per_line";
    }),
    bind([draft, optionStore], packageBox, (d, o) => [o.options, d.allowance, d.planAllowance], (options) =>
      packageChoices(options, draft.getState()).map((choice) =>
        chip({ label: choice.label, sublabel: choice.sublabel, selected: choice.picked, onClick: () => pickPackage(choice) }),
      ),
    ),
    watch(draft, (d) => [allowanceError(d), planAllowanceError(d)], (customers, lines) => {
      fields.allowance.setError(customers);
      fields.planAllowance.setError(lines);
    }),
    watch(draft, (d) => [monthlyBillText(d)], (text) => {
      billValue.textContent = text;
    }),
    watch([draft, tenantStore], (d, s) => [canSubmit(d, isEditing), s.saving], (ready, saving) => {
      submit.disabled = !ready || saving;
      submit.textContent = saving ? "Saving…" : submitLabel;
    }),
  );
  if (!isEditing) {
    stops.push(watch(draft, (d) => [passwordHint(d.adminPassword)], (hint) => fields.adminPassword.setError(hint)));
  }
  fields.name.input.focus();
}
