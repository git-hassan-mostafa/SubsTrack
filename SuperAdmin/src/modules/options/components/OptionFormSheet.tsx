import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { AppOption } from "@/src/core/types";
import { useOptionStore } from "../store/optionStore";

interface Props {
  visible: boolean;
  // null = create mode; an option = edit mode (key becomes read-only).
  option: AppOption | null;
  onDismiss: () => void;
}

export function OptionFormSheet({ visible, option, onDismiss }: Props) {
  const { createOption, updateOption, loading, error, clearError } =
    useOptionStore();
  const isEdit = !!option;

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (visible) {
      setKey(option?.key ?? "");
      setValue(option?.value ?? "");
      setDescription(option?.description ?? "");
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, option]);

  async function handleSubmit() {
    const payload = { key, value, description };
    const success = isEdit
      ? await updateOption(option!.id, payload)
      : await createOption(payload);
    if (success) onDismiss();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEdit ? `Edit — ${option?.key}` : "New Option"}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label="Key"
            value={key}
            onChangeText={setKey}
            onFocus={clearError}
            placeholder="e.g. LiraRate"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isEdit}
          />
          {isEdit ? (
            <Text style={styles.hint}>
              The key cannot be changed after creation.
            </Text>
          ) : null}

          <Input
            label="Value"
            value={value}
            onChangeText={setValue}
            onFocus={clearError}
            placeholder="e.g. 89000"
          />

          <Input
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            onFocus={clearError}
            placeholder="What this option controls"
            multiline
          />

          <View style={styles.submitRow}>
            <Button
              label={isEdit ? "Save Changes" : "Create Option"}
              onPress={handleSubmit}
              loading={loading}
              fullWidth
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: { fontSize: 18, fontWeight: "600", color: "#1e293b" },
  cancel: { fontSize: 16, color: "#0a7ea4", fontWeight: "500" },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: -8, marginBottom: 8 },
  submitRow: { marginTop: 16, marginBottom: 32 },
});
