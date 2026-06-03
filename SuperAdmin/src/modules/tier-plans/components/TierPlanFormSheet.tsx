import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { TierPlan } from "@/src/core/types";
import { useTierPlanStore } from "../store/tierPlanStore";

interface Props {
  visible: boolean;
  tierPlan: TierPlan | null;
  onDismiss: () => void;
}

function toLimitText(v: number | null): string {
  return v === null ? "" : String(v);
}
function parseLimit(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

export function TierPlanFormSheet({ visible, tierPlan, onDismiss }: Props) {
  const { updateTierPlan, loading, error, clearError } = useTierPlanStore();

  const [name, setName] = useState("");
  const [maxCustomers, setMaxCustomers] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [maxPlans, setMaxPlans] = useState("");
  const [maxBranches, setMaxBranches] = useState("");
  const [maxCurrencies, setMaxCurrencies] = useState("");
  const [multiCurrency, setMultiCurrency] = useState(false);
  const [multiMonth, setMultiMonth] = useState(false);
  const [graceDays, setGraceDays] = useState("0");
  const [priceMonthly, setPriceMonthly] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (visible && tierPlan) {
      setName(tierPlan.name);
      setMaxCustomers(toLimitText(tierPlan.maxCustomers));
      setMaxUsers(toLimitText(tierPlan.maxUsers));
      setMaxPlans(toLimitText(tierPlan.maxPlans));
      setMaxBranches(toLimitText(tierPlan.maxBranches));
      setMaxCurrencies(toLimitText(tierPlan.maxCurrencies));
      setMultiCurrency(tierPlan.multiCurrencyEnabled);
      setMultiMonth(tierPlan.multiMonthPlansEnabled);
      setGraceDays(String(tierPlan.graceDays));
      setPriceMonthly(String(tierPlan.priceMonthlyUsd));
      setActive(tierPlan.active);
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tierPlan]);

  async function handleSubmit() {
    if (!tierPlan) return;
    const success = await updateTierPlan(tierPlan.id, {
      name,
      maxCustomers: parseLimit(maxCustomers),
      maxUsers: parseLimit(maxUsers),
      maxPlans: parseLimit(maxPlans),
      maxBranches: parseLimit(maxBranches),
      maxCurrencies: parseLimit(maxCurrencies),
      multiCurrencyEnabled: multiCurrency,
      multiMonthPlansEnabled: multiMonth,
      graceDays: parseInt(graceDays, 10) || 0,
      priceMonthlyUsd: parseFloat(priceMonthly) || 0,
      priceYearlyUsd: null,
      active,
    });
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
          <Text style={styles.title}>Edit Tier — {tierPlan?.name}</Text>
          <Pressable onPress={onDismiss}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label="Display name"
            value={name}
            onChangeText={setName}
            onFocus={clearError}
          />

          <Text style={styles.section}>Limits — leave blank for unlimited</Text>

          <Input
            label="Max customers"
            value={maxCustomers}
            onChangeText={setMaxCustomers}
            placeholder="e.g. 30"
            keyboardType="number-pad"
            onFocus={clearError}
          />
          <Input
            label="Max users"
            value={maxUsers}
            onChangeText={setMaxUsers}
            placeholder="e.g. 1"
            keyboardType="number-pad"
            onFocus={clearError}
          />
          <Input
            label="Max plans"
            value={maxPlans}
            onChangeText={setMaxPlans}
            placeholder="e.g. 3"
            keyboardType="number-pad"
            onFocus={clearError}
          />
          <Input
            label="Max branches"
            value={maxBranches}
            onChangeText={setMaxBranches}
            placeholder="e.g. 1"
            keyboardType="number-pad"
            onFocus={clearError}
          />
          <Input
            label="Max currencies"
            value={maxCurrencies}
            onChangeText={setMaxCurrencies}
            placeholder="e.g. 0"
            keyboardType="number-pad"
            onFocus={clearError}
          />

          <Text style={styles.section}>Features</Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Multi-currency</Text>
            <Switch
              value={multiCurrency}
              onValueChange={setMultiCurrency}
              trackColor={{ true: "#0a7ea4" }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Multi-month plans</Text>
            <Switch
              value={multiMonth}
              onValueChange={setMultiMonth}
              trackColor={{ true: "#0a7ea4" }}
            />
          </View>

          <Input
            label="Grace days"
            value={graceDays}
            onChangeText={setGraceDays}
            placeholder="0"
            keyboardType="number-pad"
            onFocus={clearError}
          />

          <Text style={styles.section}>Pricing</Text>

          <Input
            label="Monthly price (USD)"
            value={priceMonthly}
            onChangeText={setPriceMonthly}
            placeholder="0"
            keyboardType="decimal-pad"
            onFocus={clearError}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Active</Text>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ true: "#0a7ea4" }}
            />
          </View>

          <View style={styles.submitRow}>
            <Button
              label="Save Changes"
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
  section: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    marginBottom: 8,
  },
  switchLabel: { fontSize: 14, fontWeight: "500", color: "#374151" },
  submitRow: { marginTop: 16, marginBottom: 32 },
});
