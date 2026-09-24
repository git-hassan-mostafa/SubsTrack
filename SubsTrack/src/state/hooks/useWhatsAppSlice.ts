import { useMemo } from "react";
import type { WhatsAppTemplate, WhatsAppTemplatePurpose } from "@/src/core/types";
import { whatsAppService } from "@/src/modules/whatsapp/services/WhatsAppService";
import { useWhatsAppLanguage } from "@/src/state/hooks/useTenantSettingSlice";
import { useGlobalStore } from "@/src/state/hooks/useGlobalStore";
import type { WhatsAppSlice } from "@/src/state/slices/whatsapp/whatsappSlice";

export function useWhatsAppSlice(): WhatsAppSlice;
export function useWhatsAppSlice<T>(selector: (state: WhatsAppSlice) => T): T;
export function useWhatsAppSlice<T = WhatsAppSlice>(
  selector?: (state: WhatsAppSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.whatsapp;
    return selector ? selector(slice) : (slice as T);
  });
}

export const useWhatsAppReady = (): boolean =>
  useWhatsAppSlice((s) => whatsAppService.isReady(s.account));

export const useSendableTemplates = (): WhatsAppTemplate[] => {
  const templates = useWhatsAppSlice((s) => s.templates);
  const language = useWhatsAppLanguage();
  return useMemo(
    () => whatsAppService.sendableTemplates(templates, language),
    [templates, language],
  );
};

export const useTemplateForPurpose = (
  purpose: WhatsAppTemplatePurpose | null,
): WhatsAppTemplate | null => {
  const templates = useWhatsAppSlice((s) => s.templates);
  const language = useWhatsAppLanguage();
  return useMemo(
    () =>
      purpose
        ? whatsAppService.templateForPurpose(templates, purpose, language)
        : null,
    [templates, purpose, language],
  );
};

export const useOptedOutCustomerIds = (): Set<string> => {
  const optOuts = useWhatsAppSlice((s) => s.optOuts);
  return useMemo(() => whatsAppService.optedOutCustomerIds(optOuts), [optOuts]);
};
