import { Stack } from "expo-router";

// Keeps `index` under a deep-linked/refreshed nested page — see the customers layout.
export const unstable_settings = { anchor: "index" };

export default function MoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="my-wallet" />
      <Stack.Screen name="developer" />
      <Stack.Screen name="users" />
      <Stack.Screen name="wallets" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="products" />
      <Stack.Screen name="services" />
      <Stack.Screen name="tenant-settings" />
      <Stack.Screen name="audit" />
      <Stack.Screen name="currencies" />
      <Stack.Screen name="branches" />
      <Stack.Screen name="whatsapp" />
      <Stack.Screen name="whatsapp-history" />
    </Stack>
  );
}
