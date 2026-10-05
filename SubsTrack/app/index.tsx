import { Redirect, type Href } from "expo-router";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";
import {
  landingPage,
  type LandingPage,
} from "@shared/modules/authentication/auth/utils/pageAccess";

const LANDING_HREF: Record<LandingPage, Href> = {
  dashboard: "/(app)/(tabs)/home",
  customers: "/(app)/(tabs)/customers",
};

export default function RootIndex() {
  const user = useAuthSlice((s) => s.user);
  const loading = useAuthSlice((s) => s.loading);
  const viewer = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href={LANDING_HREF[landingPage(viewer)]} />;
}
