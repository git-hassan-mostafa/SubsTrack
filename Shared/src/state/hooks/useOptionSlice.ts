import { useGlobalStore } from "@shared/state/hooks/useGlobalStore";
import type { OptionSlice } from "@shared/state/slices/options/optionSlice";
import { OPTION_KEYS } from "@shared/modules/options/utils/constants";
import { isClientOutdated } from "@shared/modules/options/utils/clientVersion";
import {
  legalLinks,
  type LegalLinks,
} from "@shared/modules/options/utils/legalLinks";

export function useOptionSlice(): OptionSlice;
export function useOptionSlice<T>(selector: (state: OptionSlice) => T): T;
export function useOptionSlice<T = OptionSlice>(
  selector?: (state: OptionSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.options;
    return selector ? selector(slice) : (slice as T);
  });
}

/** Raw string value of a global option, or `null` if the row is absent. */
export const useOptionValue = (key: string): string | null =>
  useOptionSlice(
    (s) =>
      s.items.find((o) => o.key.toLowerCase() === key.toLowerCase())?.value ??
      null,
  );

export const useSupportWhatsAppNumber = (): string | null =>
  useOptionValue(OPTION_KEYS.supportWhatsAppNumber);

// Blank until the SaaS owner sets it, which is what hides the portal fields.
export const useCustomerPortalUrl = (): string | null =>
  useOptionValue(OPTION_KEYS.customerPortalUrl);

// Blank until the SaaS owner sets WebsiteUrl, which hides every legal link.
export const useLegalLinks = (): LegalLinks | null =>
  legalLinks(useOptionValue(OPTION_KEYS.websiteUrl));

export const useClientOutdated = (): boolean =>
  isClientOutdated(useOptionValue(OPTION_KEYS.minClientVersion));

export const useAppDownloadUrl = (): string | null =>
  useOptionValue(OPTION_KEYS.appDownloadUrl)?.trim() || null;

export interface WhatsAppSignupOptions {
  appId: string | null;
  configId: string | null;
  connectUrl: string | null;
}

// Set by the SaaS owner; any blank one hides the Cloud API feature.
export const useWhatsAppSignupOptions = (): WhatsAppSignupOptions => {
  const appId = useOptionValue(OPTION_KEYS.whatsAppAppId)?.trim() || null;
  const configId = useOptionValue(OPTION_KEYS.whatsAppConfigId)?.trim() || null;
  const connectUrl =
    useOptionValue(OPTION_KEYS.whatsAppConnectUrl)?.trim() || null;
  return { appId, configId, connectUrl };
};
