import { DataTable } from "../../../shared/ui/DataTable.js";
import { EmptyState, ErrorBanner } from "../../../shared/ui/ErrorBanner.js";
import { bind, button, h, watch } from "../../../shared/ui/dom.js";
import { clearError, fetchTenants, tenantStore } from "../store/tenantStore.js";
import {
  PRICING_MODEL_LABELS,
  limitsText,
  monthlyBillText,
  requestText,
  shortDate,
} from "../utils/tenantDisplay.js";
import { StatusPill } from "./StatusPill.js";
import { openTenantDetails } from "./TenantDetailsDialog.js";
import { openTenantForm } from "./TenantFormDialog.js";

function EditButton(tenant) {
  return button("Edit", "btn-text", (event) => {
    event.stopPropagation();
    openTenantForm(tenant.id);
  });
}

function RequestPill(tenant) {
  return tenant.pendingRequest ? h("span", { class: "pill pill-warn" }, requestText(tenant.pendingRequest)) : "—";
}

const COLUMNS = [
  { label: "Name", class: "strong cell-title", render: (t) => t.name },
  { label: "Code", class: "muted", render: (t) => t.tenantCode },
  { label: "Status", render: (t) => StatusPill(t.active) },
  { label: "Pricing", render: (t) => PRICING_MODEL_LABELS[t.pricingModel] },
  { label: "Limits", render: limitsText },
  { label: "Monthly bill", class: "num", render: monthlyBillText },
  { label: "WhatsApp", render: (t) => (t.whatsappEnabled ? "Yes" : "—") },
  { label: "Request", render: RequestPill },
  { label: "Created", class: "muted", render: (t) => shortDate(t.createdAt) },
  { label: "", class: "cell-actions", render: EditButton },
];

function TenantTable(tenants, loaded, loading) {
  if (!loaded) return h("p", { class: "muted pad" }, loading ? "Loading…" : "");
  if (tenants.length === 0) return EmptyState("No tenants yet", "Use Add tenant to create the first one.");
  return DataTable(COLUMNS, tenants, (tenant) => openTenantDetails(tenant.id));
}

export function TenantsPage() {
  const bannerBox = h("div");
  const tableBox = h("div");
  const refresh = button("Refresh", "btn-ghost", () => fetchTenants());
  const element = h(
    "section",
    { class: "page" },
    h(
      "div",
      { class: "page-header" },
      h("h1", {}, "Tenants"),
      h("div", { class: "page-actions" }, refresh, button("Add tenant", "btn-primary", () => openTenantForm(null))),
    ),
    bannerBox,
    tableBox,
  );
  const stops = [
    bind(tenantStore, bannerBox, (s) => [s.error], (error) => ErrorBanner(error, clearError)),
    bind(tenantStore, tableBox, (s) => [s.tenants, s.loaded, s.loading], TenantTable),
    watch(tenantStore, (s) => [s.loading], (loading) => {
      refresh.disabled = loading;
      refresh.textContent = loading ? "Refreshing…" : "Refresh";
    }),
  ];
  void fetchTenants();
  return { element, dispose: () => stops.forEach((stop) => stop()) };
}
