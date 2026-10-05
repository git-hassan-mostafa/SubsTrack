import {
  landingPage,
  type LandingPage,
  type Viewer,
} from "@shared/modules/authentication/auth/utils/pageAccess";

const LANDING_PATH: Record<LandingPage, string> = {
  dashboard: "/dashboard",
  customers: "/customers",
};

export function landingPath(viewer: Viewer): string {
  return LANDING_PATH[landingPage(viewer)];
}
