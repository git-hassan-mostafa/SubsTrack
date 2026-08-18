import { Stack } from "expo-router";

// Keeps `index` under a deep-linked/refreshed nested page — see the customers layout.
export const unstable_settings = { anchor: "index" };

export default function ReportsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
