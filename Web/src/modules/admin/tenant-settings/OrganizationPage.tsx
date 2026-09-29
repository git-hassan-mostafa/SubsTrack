import { useEffect } from "react";
import Stack from "@mui/material/Stack";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useTenantSettingSlice } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { LimitsSection } from "@/modules/admin/billing/LimitsSection";
import { DisplayCurrencySection } from "./DisplayCurrencySection";
import { UnpaidRuleSection } from "./UnpaidRuleSection";

// Opening the page re-reads the counts and the request; other admins move them.
export function OrganizationPage() {
  const { user } = useAuth();
  const getSettings = useTenantSettingSlice((s) => s.getSettings);
  const error = useTenantSettingSlice((s) => s.error);
  const clearError = useTenantSettingSlice((s) => s.clearError);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const refreshCounts = useBillingSlice((s) => s.refreshCounts);
  const refreshRequest = useBillingSlice((s) => s.refreshRequest);
  const tenantId = user?.tenantId;

  useEffect(() => {
    void getSettings();
    void getCurrencies();
    void refreshCounts();
    if (tenantId) void refreshRequest(tenantId);
  }, [getSettings, getCurrencies, refreshCounts, refreshRequest, tenantId]);

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <ErrorBanner message={error} onDismiss={clearError} />
      <LimitsSection />
      <DisplayCurrencySection />
      <UnpaidRuleSection />
    </Stack>
  );
}
