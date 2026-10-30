import { monthlyAmountUsdOf } from "@shared/modules/admin/billing/utils/monthlyAmount";
import { pricePackages } from "@shared/modules/admin/billing/utils/packages";
import { MIN_CUSTOMER_ALLOWANCE } from "@shared/modules/admin/billing/utils/types";
import { formatMoney } from "@shared/core/utils/currency";
import { MIN_PASSWORD_LENGTH } from "./TenantService.js";

export const DEFAULT_ALLOWANCE = String(MIN_CUSTOMER_ALLOWANCE);
export const DEFAULT_PRICE = "0.15";

const isWhole = (text) => Number.isInteger(Number(text));

export function initialDraft(tenant) {
  const pending = tenant?.pendingRequest ?? null;
  return {
    name: tenant?.name ?? "",
    tenantCode: tenant?.tenantCode ?? "",
    active: tenant?.active ?? true,
    whatsappEnabled: tenant?.whatsappEnabled ?? false,
    allowance: tenant ? String(tenant.customerAllowance) : DEFAULT_ALLOWANCE,
    planAllowance: tenant ? String(tenant.planAllowance) : DEFAULT_ALLOWANCE,
    price: tenant ? String(tenant.pricePerPlanUsd) : DEFAULT_PRICE,
    pricingModel: tenant?.pricingModel ?? "per_line",
    fixedPrice: tenant?.fixedPriceUsd != null ? String(tenant.fixedPriceUsd) : "",
    granted: pending ? String(pending.requestedCount) : "",
    grantedPlans: pending ? String(pending.requestedPlans) : "",
    adminUserName: "",
    adminFullName: "",
    adminPassword: "",
  };
}

function fixedPriceUsdOf(draft) {
  return draft.pricingModel === "per_line" ? null : Number(draft.fixedPrice);
}

function isFixedPriceValid(draft) {
  if (draft.pricingModel === "per_line") return true;
  const fixed = Number(draft.fixedPrice);
  return draft.fixedPrice.trim() !== "" && Number.isFinite(fixed) && fixed >= 0;
}

export function isBillingValid(draft) {
  const allowance = Number(draft.allowance);
  const price = Number(draft.price);
  return (
    isWhole(draft.allowance) &&
    allowance >= MIN_CUSTOMER_ALLOWANCE &&
    isWhole(draft.planAllowance) &&
    Number(draft.planAllowance) >= allowance &&
    Number.isFinite(price) &&
    price >= 0 &&
    isFixedPriceValid(draft)
  );
}

export function canSubmit(draft, isEditing) {
  const base = !!draft.name.trim() && !!draft.tenantCode.trim() && isBillingValid(draft);
  if (isEditing) return base;
  return (
    base &&
    !!draft.adminUserName.trim() &&
    !!draft.adminFullName.trim() &&
    draft.adminPassword.length >= MIN_PASSWORD_LENGTH
  );
}

export function monthlyBillText(draft) {
  if (!isBillingValid(draft)) return "—";
  const amount = monthlyAmountUsdOf({
    pricingModel: draft.pricingModel,
    planAllowance: Number(draft.planAllowance),
    pricePerPlanUsd: Number(draft.price),
    fixedPriceUsd: fixedPriceUsdOf(draft),
  });
  return formatMoney(amount, null, null);
}

export function allowanceError(draft) {
  return draft.allowance && Number(draft.allowance) < MIN_CUSTOMER_ALLOWANCE
    ? `Minimum ${MIN_CUSTOMER_ALLOWANCE} customers`
    : null;
}

export function planAllowanceError(draft) {
  return draft.planAllowance && Number(draft.planAllowance) < Number(draft.allowance)
    ? "Cannot be below the customer allowance"
    : null;
}

export function passwordHint(password) {
  return password.length > 0 && password.length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    : null;
}

export function grantOf(draft) {
  return { customers: Number(draft.granted), plans: Number(draft.grantedPlans) };
}

export function isGrantValid(draft) {
  const { customers, plans } = grantOf(draft);
  return (
    isWhole(draft.granted) &&
    isWhole(draft.grantedPlans) &&
    customers >= 0 &&
    plans >= 0 &&
    customers + plans >= 1
  );
}

// Boxes follow an accepted raise, else the next Save writes it back (#146).
export function allowancesAfterAccept(draft, grant) {
  const customers = Number(draft.allowance) + grant.customers;
  return {
    allowance: String(customers),
    planAllowance: String(Math.max(Number(draft.planAllowance) + grant.plans, customers)),
  };
}

// A package size is both limits; picking one fills the (still editable) boxes.
export function packageChoices(options, draft) {
  return pricePackages(options).map((pkg) => ({
    label: pkg.size.toLocaleString("en-US"),
    sublabel: pkg.priceUsd == null ? "No price set" : `${formatMoney(pkg.priceUsd, null, null)}/mo`,
    picked: Number(draft.allowance) === pkg.size && Number(draft.planAllowance) === pkg.size,
    fields: {
      allowance: String(pkg.size),
      planAllowance: String(pkg.size),
      fixedPrice: pkg.priceUsd == null ? "" : String(pkg.priceUsd),
    },
  }));
}

export function toCreateInput(draft) {
  return {
    name: draft.name,
    tenantCode: draft.tenantCode,
    adminUserName: draft.adminUserName,
    adminFullName: draft.adminFullName,
    adminPassword: draft.adminPassword,
    customerAllowance: Number(draft.allowance),
    planAllowance: Number(draft.planAllowance),
    pricePerPlanUsd: Number(draft.price),
    pricingModel: draft.pricingModel,
    fixedPriceUsd: fixedPriceUsdOf(draft),
  };
}

export function toUpdateInput(draft) {
  return {
    name: draft.name,
    active: draft.active,
    customerAllowance: Number(draft.allowance),
    planAllowance: Number(draft.planAllowance),
    pricePerPlanUsd: Number(draft.price),
    pricingModel: draft.pricingModel,
    fixedPriceUsd: fixedPriceUsdOf(draft),
    whatsappEnabled: draft.whatsappEnabled,
  };
}
