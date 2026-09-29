import { createBrowserRouter } from "react-router";
import { AppFrame } from "@/app/layout/AppFrame";
import { ComingSoonPage } from "@/app/layout/ComingSoonPage";
import { NotFoundPage } from "@/app/layout/NotFoundPage";
import type { PageHandle } from "@/app/layout/usePageTitle";
import { LoginPage } from "@/modules/auth/LoginPage";
import { APP_PAGES } from "./appPages";
import { GuestOnly } from "./GuestOnly";
import { LandingRedirect } from "./LandingRedirect";
import { RequireAccess } from "./RequireAccess";
import { RequireSignedIn } from "./RequireSignedIn";
import { SessionGate } from "./SessionGate";

export const router = createBrowserRouter([
  {
    element: <SessionGate />,
    children: [
      {
        element: <GuestOnly />,
        children: [{ path: "login", element: <LoginPage /> }],
      },
      {
        element: <RequireSignedIn />,
        children: [
          {
            element: <AppFrame />,
            children: [
              { index: true, element: <LandingRedirect /> },
              ...APP_PAGES.map(({ path, titleKey, access, component: Page = ComingSoonPage }) => ({
                path,
                handle: { titleKey } satisfies PageHandle,
                element: (
                  <RequireAccess access={access}>
                    <Page />
                  </RequireAccess>
                ),
              })),
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
