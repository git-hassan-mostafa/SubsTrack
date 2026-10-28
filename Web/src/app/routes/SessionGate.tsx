import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { LoadingScreen } from "@/shared/components/LoadingScreen";
import { ReloadPage } from "@/app/layout/ReloadPage";
import { useClientGate } from "./useClientGate";

// Nothing routes until the saved session has been checked once.
export function SessionGate() {
  const { t } = useTranslation();
  const loading = useAuthSlice((s) => s.loading);
  const outdated = useClientGate();
  if (loading) return <LoadingScreen />;
  if (outdated) {
    return (
      <ReloadPage
        title={t("update_required.title")}
        message={t("web.update_message")}
      />
    );
  }
  return <Outlet />;
}
