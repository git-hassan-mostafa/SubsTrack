import { Stack } from "expo-router";

// A web refresh (or deep link) on a nested page builds a stack holding only that
// page, so the tab icon's pop-to-top and `router.back()` have nothing to fall
// back to. The anchor puts `index` underneath, restoring both. See gotcha #82.
export const unstable_settings = { anchor: "index" };

export default function CustomersLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
