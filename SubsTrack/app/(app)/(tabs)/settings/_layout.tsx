import { Stack } from "expo-router";

// Keeps `index` under a deep-linked/refreshed nested page — see the customers layout.
export const unstable_settings = { anchor: "index" };

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="my-wallet" />
      <Stack.Screen name="developer" />
    </Stack>
  );
}
