import { Outlet } from "react-router";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { LoadingScreen } from "@/shared/components/LoadingScreen";

// Nothing routes until the saved session has been checked once.
export function SessionGate() {
  const loading = useAuthSlice((s) => s.loading);
  if (loading) return <LoadingScreen />;
  return <Outlet />;
}
