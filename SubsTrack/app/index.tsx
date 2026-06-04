import { Redirect } from "expo-router";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";

export default function RootIndex() {
  const user = useAuthSlice((s) => s.user);
  const loading = useAuthSlice((s) => s.loading);

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  return (
    <Redirect
      href={isAdmin ? "/(app)/(tabs)/home" : "/(app)/(tabs)/customers"}
    />
  );
}
