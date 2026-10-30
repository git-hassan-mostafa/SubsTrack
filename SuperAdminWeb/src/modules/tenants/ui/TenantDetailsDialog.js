import { openDialog } from "../../../shared/ui/Dialog.js";
import { ErrorBanner } from "../../../shared/ui/ErrorBanner.js";
import { bind, button, h } from "../../../shared/ui/dom.js";
import { textField } from "../../../shared/ui/fields.js";
import {
  clearDetailsError,
  closeDetails,
  fetchDetails,
  resetOwnerPassword,
  tenantStore,
} from "../store/tenantStore.js";
import { accountRows, countRows, subscriptionRows } from "../utils/tenantDisplay.js";
import { StatusPill } from "./StatusPill.js";

function DetailCard(rows) {
  return h(
    "dl",
    { class: "detail-card" },
    rows.map((row) => h("div", { class: "detail-row" }, h("dt", {}, row.label), h("dd", {}, row.value))),
  );
}

const Loading = () => h("div", { class: "detail-card muted pad" }, "Loading…");

// Keeps its own DOM, so a store update never wipes a half-typed password.
function OwnerRow(owner) {
  const password = textField({
    label: "New password",
    type: "password",
    autocomplete: "new-password",
    onFocus: clearDetailsError,
  });
  const note = h("p", { class: "owner-note", hidden: true }, "Password changed");
  const reset = button("Reset password", "btn-text", start);
  const save = button("Save", "btn-primary", null, "submit");
  const form = h(
    "form",
    { class: "owner-form", hidden: true, onSubmit: submit },
    password.element,
    h("div", { class: "actions" }, button("Cancel", "btn-ghost", cancel), save),
  );

  function showForm(open) {
    form.hidden = !open;
    reset.hidden = open;
  }

  function start() {
    note.hidden = true;
    password.setValue("");
    showForm(true);
    password.input.focus();
  }

  function cancel() {
    clearDetailsError();
    showForm(false);
  }

  async function submit(event) {
    event.preventDefault();
    save.disabled = true;
    save.textContent = "Saving…";
    const ok = await resetOwnerPassword(owner.id, password.input.value);
    save.disabled = false;
    save.textContent = "Save";
    if (!ok) return;
    password.setValue("");
    showForm(false);
    note.hidden = false;
  }

  return h(
    "div",
    { class: "owner" },
    h(
      "div",
      { class: "owner-head" },
      h("div", {}, h("div", { class: "strong" }, owner.fullName), h("div", { class: "muted" }, `@${owner.username}`)),
      reset,
    ),
    note,
    form,
  );
}

function OwnersCard(owners, loading) {
  if (loading) return Loading();
  if (owners.length === 0) return h("div", { class: "detail-card muted pad" }, "No owner login found.");
  return h("div", { class: "detail-card" }, owners.map(OwnerRow));
}

export function openTenantDetails(tenantId) {
  const titleBox = h("div");
  const bannerBox = h("div");
  const accountBox = h("div");
  const ownersBox = h("div");
  const subscriptionBox = h("div");
  const dataBox = h("div");
  const stops = [];
  const dialog = openDialog({
    title: "Tenant details",
    size: "wide",
    onClose: () => {
      stops.forEach((stop) => stop());
      closeDetails();
    },
  });
  dialog.body.append(
    titleBox,
    bannerBox,
    h("h3", { class: "section-title" }, "Account"),
    accountBox,
    h("h3", { class: "section-title" }, "Owner login"),
    ownersBox,
    h("h3", { class: "section-title" }, "Subscription"),
    subscriptionBox,
    h("h3", { class: "section-title" }, "Data"),
    dataBox,
  );

  const liveTenant = (s) => s.tenants.find((t) => t.id === tenantId) ?? null;
  stops.push(
    bind(tenantStore, titleBox, (s) => [liveTenant(s)], (tenant) =>
      tenant ? h("div", { class: "name-row" }, h("h2", { class: "name" }, tenant.name), StatusPill(tenant.active)) : null,
    ),
    bind(tenantStore, bannerBox, (s) => [s.detailsError], (error) => ErrorBanner(error, clearDetailsError)),
    bind(tenantStore, accountBox, (s) => [liveTenant(s)], (tenant) => (tenant ? DetailCard(accountRows(tenant)) : null)),
    bind(tenantStore, ownersBox, (s) => [s.owners, s.ownersLoading], OwnersCard),
    bind(tenantStore, subscriptionBox, (s) => [liveTenant(s), s.counts], (tenant, counts) =>
      tenant ? DetailCard(subscriptionRows(tenant, counts)) : null,
    ),
    bind(tenantStore, dataBox, (s) => [s.counts, s.countsLoading], (counts, loading) => {
      if (loading) return Loading();
      return counts ? DetailCard(countRows(counts)) : h("div", { class: "detail-card muted pad" }, "Not loaded.");
    }),
  );
  void fetchDetails(tenantId);
}
