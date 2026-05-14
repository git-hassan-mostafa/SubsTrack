import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";
import { Button } from "@/src/shared/components/Button";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#f1f5f9",
    gap: 12,
  },
  errorTitle: { fontSize: 20, fontWeight: "700", color: "#1e293b" },
  errorMessage: { fontSize: 14, color: "#64748b", textAlign: "center" },
});
