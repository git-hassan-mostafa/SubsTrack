import type { AppOption } from "@shared/core/types";
import { OPTION_KEYS } from "@shared/modules/options/utils/constants";
import { optionValue } from "@shared/modules/options/utils/optionValue";
import type { TenantPricing } from "@shared/modules/admin/billing/utils/types";

export interface PricePackage {
  size: number;
  priceUsd: number | null;
}

// The website's three cards; a size is both limits. SuperAdmin copy (#149k).
const PACKAGE_OPTIONS = [
  { size: 300, priceKey: OPTION_KEYS.package300Usd },
  { size: 500, priceKey: OPTION_KEYS.package500Usd },
  { size: 1000, priceKey: OPTION_KEYS.package1000Usd },
];

// Blank or bad option = no price yet, so the tenant asks support for it.
export function parsePackagePrice(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
}

export function pricePackages(options: AppOption[]): PricePackage[] {
  return PACKAGE_OPTIONS.map(({ size, priceKey }) => ({
    size,
    priceUsd: parsePackagePrice(optionValue(options, priceKey)),
  }));
}

export function currentPackageSize(
  pricing: Pick<TenantPricing, "pricingModel" | "planAllowance">,
): number | null {
  if (pricing.pricingModel !== "package") return null;
  return PACKAGE_OPTIONS.find((p) => p.size === pricing.planAllowance)?.size ?? null;
}
