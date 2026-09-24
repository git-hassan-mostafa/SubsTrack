import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PortalErrorCode } from "../repository/PortalRepository";
import { usePortalStore } from "../state/portalStore";
import { LanguageToggle } from "../components/LanguageToggle";

// Only bad_credentials may read as a wrong password: a server fault or an
// unconfigured endpoint wearing that message sends staff hunting the password.
const MESSAGE_KEYS: Record<PortalErrorCode, string> = {
  bad_credentials: "wrong_password",
  bad_token: "wrong_password",
  no_token: "wrong_password",
  locked: "locked",
  unavailable: "unavailable",
  offline: "offline",
  server_error: "server_error",
  bad_link: "bad_link",
  not_configured: "not_configured",
};

// Deliberately shows neither the organisation nor the customer name: the link is
// a bare customer id, so naming either before the password is entered would turn
// the page into a "does this customer exist?" oracle.
export function LoginScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const signIn = usePortalStore((s) => s.signIn);
  const signingIn = usePortalStore((s) => s.signingIn);
  const error = usePortalStore((s) => s.error);
  const clearError = usePortalStore((s) => s.clearError);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LanguageToggle />
        </div>
        <form
          className="rounded-2xl border border-gray-300 bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(password);
          }}
        >
          <h1 className="text-xl font-bold text-gray-900">
            {t("portal.sign_in")}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {t("portal.sign_in_hint")}
          </p>

          <label
            htmlFor="portal-password"
            className="mb-1.5 mt-5 block text-sm font-semibold text-gray-700"
          >
            {t("portal.password")}
          </label>
          <input
            id="portal-password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-base text-gray-900 outline-none focus:border-primary"
            placeholder={t("portal.password_placeholder")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) clearError();
            }}
          />

          {error ? (
            <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {t(`portal.${MESSAGE_KEYS[error]}`)}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={signingIn || !password}
            className="mt-5 w-full rounded-xl bg-primary py-3.5 text-base font-bold text-white disabled:opacity-40"
          >
            {signingIn ? t("portal.loading") : t("portal.sign_in")}
          </button>
        </form>
      </div>
    </div>
  );
}
