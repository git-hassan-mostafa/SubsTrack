import { useEffect } from "react";
import Stack from "@mui/material/Stack";
import { useTenantSettingSlice } from "@shared/state/hooks/useTenantSettingSlice";
import { useWhatsAppSlice } from "@shared/state/hooks/useWhatsAppSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { WhatsAppConnectionSection } from "../components/WhatsAppConnectionSection";
import { WhatsAppLanguageSection } from "../components/WhatsAppLanguageSection";
import { WhatsAppTemplatesSection } from "../components/WhatsAppTemplatesSection";

// The signup page sends the admin back here, so opening always re-reads.
export function WhatsAppSettingsPage() {
  const account = useWhatsAppSlice((s) => s.account);
  const error = useWhatsAppSlice((s) => s.error);
  const clearError = useWhatsAppSlice((s) => s.clearError);
  const fetchOverview = useWhatsAppSlice((s) => s.fetchOverview);
  const getSettings = useTenantSettingSlice((s) => s.getSettings);

  useEffect(() => {
    void getSettings();
    void fetchOverview();
  }, [getSettings, fetchOverview]);

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <ErrorBanner message={error} onDismiss={clearError} />
      <WhatsAppConnectionSection />
      <WhatsAppLanguageSection />
      {account ? <WhatsAppTemplatesSection /> : null}
    </Stack>
  );
}
