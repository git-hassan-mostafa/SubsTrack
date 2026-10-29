import type { AppOption, PricingModel } from "../../../core/types";

export const FREE_PLAN_LINES = 20;

export const PRICING_MODELS: PricingModel[] = ["per_line", "package", "unlimited"];

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  per_line: "Per service line",
  package: "Package",
  unlimited: "Unlimited",
};

export interface TenantPricing {
  pricingModel: PricingModel;
  planAllowance: number;
  pricePerPlanUsd: number;
  fixedPriceUsd: number | null;
}

// Copy of Shared monthlyAmountUsd (no Shared here); TC-CA-04f pins both.
export function monthlyBillUsd(pricing: TenantPricing): number {
  if (pricing.pricingModel !== "per_line") {
    return Math.round((pricing.fixedPriceUsd ?? 0) * 100) / 100;
  }
  if (pricing.planAllowance <= FREE_PLAN_LINES) return 0;
  return Math.round(pricing.planAllowance * pricing.pricePerPlanUsd * 100) / 100;
}

export function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export interface PricePackage {
  size: number;
  priceUsd: number | null;
}

// Copy of Shared packages.ts (no Shared here); TC-CA-16d pins both.
const PACKAGE_OPTIONS = [
  { size: 300, priceKey: "Package300Usd" },
  { size: 500, priceKey: "Package500Usd" },
  { size: 1000, priceKey: "Package1000Usd" },
];

function packagePrice(options: AppOption[], key: string): number | null {
  const raw = options.find((o) => o.key.toLowerCase() === key.toLowerCase())?.value;
  if (!raw?.trim()) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
}

export function pricePackages(options: AppOption[]): PricePackage[] {
  return PACKAGE_OPTIONS.map(({ size, priceKey }) => ({
    size,
    priceUsd: packagePrice(options, priceKey),
  }));
}
