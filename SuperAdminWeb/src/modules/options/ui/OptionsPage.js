import { DataTable } from "../../../shared/ui/DataTable.js";
import { confirmDialog } from "../../../shared/ui/Dialog.js";
import { EmptyState, ErrorBanner } from "../../../shared/ui/ErrorBanner.js";
import { bind, button, h, watch } from "../../../shared/ui/dom.js";
import { clearError, deleteOption, fetchOptions, optionStore } from "../store/optionStore.js";
import { openOptionForm } from "./OptionFormDialog.js";

async function askDelete(option) {
  const confirmed = await confirmDialog({
    title: "Delete option",
    message: `Delete "${option.key}"? This cannot be undone.`,
    confirmLabel: "Delete",
    destructive: true,
  });
  if (confirmed) await deleteOption(option.id);
}

function RowButtons(option) {
  const remove = button("Delete", "btn-text btn-text-danger", (event) => {
    event.stopPropagation();
    void askDelete(option);
  });
  return [button("Edit", "btn-text", null), remove];
}

const COLUMNS = [
  { label: "Key", class: "strong cell-title", render: (o) => o.key },
  { label: "Value", class: "wrap", render: (o) => o.value ?? "—" },
  { label: "Description", class: "wrap muted", render: (o) => o.description || null },
  { label: "", class: "cell-actions", render: RowButtons },
];

function OptionTable(options, loaded, loading) {
  if (!loaded) return h("p", { class: "muted pad" }, loading ? "Loading…" : "");
  if (options.length === 0) {
    return EmptyState("No options yet", "Add a global key/value option (e.g. LiraRate) to get started.");
  }
  return DataTable(COLUMNS, options, openOptionForm);
}

export function OptionsPage() {
  const bannerBox = h("div");
  const tableBox = h("div");
  const refresh = button("Refresh", "btn-ghost", () => fetchOptions());
  const element = h(
    "section",
    { class: "page" },
    h(
      "div",
      { class: "page-header" },
      h("h1", {}, "Options"),
      h("div", { class: "page-actions" }, refresh, button("Add option", "btn-primary", () => openOptionForm(null))),
    ),
    bannerBox,
    tableBox,
  );
  const stops = [
    bind(optionStore, bannerBox, (s) => [s.error], (error) => ErrorBanner(error, clearError)),
    bind(optionStore, tableBox, (s) => [s.options, s.loaded, s.loading], OptionTable),
    watch(optionStore, (s) => [s.loading], (loading) => {
      refresh.disabled = loading;
      refresh.textContent = loading ? "Refreshing…" : "Refresh";
    }),
  ];
  void fetchOptions();
  return { element, dispose: () => stops.forEach((stop) => stop()) };
}
