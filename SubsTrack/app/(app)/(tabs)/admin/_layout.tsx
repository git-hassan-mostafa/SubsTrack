import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

// Keeps `index` under a deep-linked/refreshed nested page — see the customers layout.
export const unstable_settings = { anchor: "index" };

export default function AdminLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: t("admin.title"), headerShown: false }}
      />
      <Stack.Screen name="users" options={{ headerShown: false }} />
      <Stack.Screen name="wallets" options={{ headerShown: false }} />
      <Stack.Screen name="plans" options={{ headerShown: false }} />
      <Stack.Screen name="products" options={{ headerShown: false }} />
      <Stack.Screen name="tenant-settings" options={{ headerShown: false }} />
      <Stack.Screen name="audit" options={{ headerShown: false }} />
      <Stack.Screen name="currencies" options={{ headerShown: false }} />
      <Stack.Screen name="branches" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
    </Stack>
  );
}
