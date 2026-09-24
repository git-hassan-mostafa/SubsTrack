import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePortalStore } from "./state/portalStore";
import { LoginScreen } from "./screens/LoginScreen";
import { PortalScreen } from "./screens/PortalScreen";

// The whole route table: the path IS the customer id. There is no other page,
// so a router would be one dependency to read one path segment.
function customerIdFromPath(): string {
  return window.location.pathname.replace(/^\/+|\/+$/g, "");
}

export function App() {
  const { t } = useTranslation();
  const init = usePortalStore((s) => s.init);
  const model = usePortalStore((s) => s.model);
  const loading = usePortalStore((s) => s.loading);
  const error = usePortalStore((s) => s.error);

  useEffect(() => {
    void init(customerIdFromPath());
  }, [init]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">{t("portal.loading")}</p>
      </div>
    );
  }

  if (model) return <PortalScreen model={model} />;

  if (error === "unavailable" || error === "bad_link") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">{t(`portal.${error}`)}</p>
      </div>
    );
  }

  return <LoginScreen />;
}
