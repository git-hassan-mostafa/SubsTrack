import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import type { AppOption } from "@/src/core/types";
import { useOptionStore } from "../store/optionStore";
import { OptionFormSheet } from "../components/OptionFormSheet";

export function OptionsScreen() {
  const { options, loading, error, fetchOptions, deleteOption, clearError } =
    useOptionStore();
  const [editing, setEditing] = useState<AppOption | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AppOption | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchOptions();
    }, []),
  );

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(option: AppOption) {
    setEditing(option);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const ok = await deleteOption(pendingDelete.id);
    if (ok) setPendingDelete(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Options</Text>
        <Pressable onPress={openCreate} hitSlop={8}>
          <Text style={styles.add}>+ Add</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && options.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0a7ea4" size="large" />
        </View>
      ) : (
        <FlatList
          data={options}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchOptions} />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openEdit(item)} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.key}>{item.key}</Text>
                <Pressable onPress={() => setPendingDelete(item)} hitSlop={8}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              </View>
              <Text style={styles.value}>{item.value ?? "—"}</Text>
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              message="No options yet"
              subMessage="Add a global key/value option (e.g. LiraRate) to get started."
            />
          }
        />
      )}

      <OptionFormSheet
        visible={formVisible}
        option={editing}
        onDismiss={() => setFormVisible(false)}
      />

      <ConfirmDialog
        visible={!!pendingDelete}
        title="Delete option"
        message={`Delete "${pendingDelete?.key}"? This cannot be undone.`}
        destructive
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1e293b" },
  add: { fontSize: 16, color: "#0a7ea4", fontWeight: "600" },
  errorContainer: { paddingHorizontal: 16, paddingTop: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, flexGrow: 1 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  key: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  delete: { fontSize: 13, color: "#ef4444", fontWeight: "600" },
  value: { fontSize: 15, color: "#334155" },
  description: { fontSize: 12, color: "#94a3b8", marginTop: 6 },
});
