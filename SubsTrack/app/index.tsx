import { Redirect } from "expo-router";
import { useAuthStore } from "@/src/modules/auth/store/authStore";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";

export default function RootIndex() {
  const { user, loading } = useAuthStore();

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
