import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouteError } from "react-router";
import { ReloadPage } from "./ReloadPage";

// The root route's ErrorBoundary: any page that throws while drawing lands here.
export function CrashPage() {
  const { t } = useTranslation();
  const error = useRouteError();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ReloadPage
      title={t("common.something_went_wrong")}
      message={t("web.crash_message")}
    />
  );
}
