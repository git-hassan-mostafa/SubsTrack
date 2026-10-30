import { monthlyAmountUsdOf } from "@shared/modules/admin/billing/utils/monthlyAmount";
import { formatMoney } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";

export const PRICING_MODELS = ["per_line", "package", "unlimited"];

export const PRICING_MODEL_LABELS = {
  per_line: "Per service line",
  package: "Package",
  unlimited: "Unlimited",
};

export const COUNT_ROWS = [
  { key: "users", label: "Staff users" },
  { key: "branches", label: "Branches" },
  { key: "customers", label: "Customers" },
  { key: "serviceLines", label: "Service lines" },
  { key: "plans", label: "Plans" },
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "currencies", label: "Currencies" },
];

export const shortDate = formatDate;

export function dollars(amount) {
  return formatMoney(amount, null, null);
}

export function monthlyBillText(tenant) {
  return `${dollars(monthlyAmountUsdOf(tenant))}/mo`;
}

export function limitsText(tenant) {
  if (tenant.pricingModel === "unlimited") return "No limit";
  return `${tenant.customerAllowance} customers · ${tenant.planAllowance} lines`;
}

export function requestText(request) {
  return `+${request.requestedCount} customers / +${request.requestedPlans} lines`;
}

// The active half is dropped when it would add nothing to read.
export function formatCount(count) {
  if (count.active === null || count.active === count.total) return String(count.total);
  return `${count.total} · ${count.active} active`;
}

function allowanceText(limit, used, limited, counts) {
  if (!limited) return `No limit · ${used ?? 0} used`;
  return counts ? `${limit} · ${used ?? 0} used` : String(limit);
}

export function accountRows(tenant) {
  return [
    { label: "Tenant code", value: tenant.tenantCode },
    { label: "Created", value: shortDate(tenant.createdAt) },
  ];
}

export function subscriptionRows(tenant, counts) {
  const limited = tenant.pricingModel !== "unlimited";
  const rows = [
    { label: "Pricing", value: PRICING_MODEL_LABELS[tenant.pricingModel] },
    {
      label: "Customer allowance",
      value: allowanceText(tenant.customerAllowance, counts?.customers.active, limited, counts),
    },
    {
      label: "Service line allowance",
      value: allowanceText(tenant.planAllowance, counts?.serviceLines.active, limited, counts),
    },
    tenant.pricingModel === "per_line"
      ? { label: "Price per service line", value: `$${tenant.pricePerPlanUsd}` }
      : { label: "Monthly price", value: dollars(tenant.fixedPriceUsd ?? 0) },
    { label: "Total price", value: dollars(monthlyAmountUsdOf(tenant)) },
  ];
  const pending = tenant.pendingRequest;
  if (pending) {
    rows.push({
      label: "Pending request",
      value: `${requestText(pending)} · ${shortDate(pending.createdAt)}`,
    });
  }
  return rows;
}

export function countRows(counts) {
  return COUNT_ROWS.map(({ key, label }) => ({ label, value: formatCount(counts[key]) }));
}
