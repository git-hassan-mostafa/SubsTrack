import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { formatShortDate } from "@/src/core/utils/formatDate";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import type {
  Tenant,
  TenantCount,
  TenantCounts,
  TenantOwner,
} from "@/src/core/types";
import { useTenantStore } from "../store/tenantStore";
import { PRICING_MODEL_LABELS, dollars, monthlyBillUsd } from "../utils/pricing";

interface Props {
  visible: boolean;
  tenant: Tenant | null;
  onDismiss: () => void;
}

interface DetailRow {
  label: string;
  value: string;
}

// Money, stock and audit counts are deliberately absent from this list.
const COUNT_ROWS: { key: keyof TenantCounts; label: string }[] = [
  { key: "users", label: "Staff users" },
  { key: "branches", label: "Branches" },
  { key: "customers", label: "Customers" },
  { key: "serviceLines", label: "Service lines" },
  { key: "plans", label: "Plans" },
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "currencies", label: "Currencies" },
];

// The active half is dropped when it would add nothing to read.
function formatCount(count: TenantCount): string {
  if (count.active === null || count.active === count.total)
    return String(count.total);
  return `${count.total} · ${count.active} active`;
}

// Owns the separators, so no row needs to know where it sits.
function DetailCard({ rows }: { rows: DetailRow[] }) {
  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={[styles.row, index > 0 && styles.rowDivided]}
        >
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function OwnerRow({ owner, divided }: { owner: TenantOwner; divided: boolean }) {
  const resetOwnerPassword = useTenantStore((s) => s.resetOwnerPassword);
  const clearError = useTenantStore((s) => s.clearError);
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  function startEditing() {
    setChanged(false);
    setPassword("");
    setEditing(true);
  }

  function cancel() {
    clearError();
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    const ok = await resetOwnerPassword(owner.id, password);
    setSaving(false);
    if (!ok) return;
    setEditing(false);
    setChanged(true);
  }

  return (
    <View style={[styles.ownerBlock, divided && styles.rowDivided]}>
      <View style={styles.ownerHeader}>
        <View style={styles.ownerInfo}>
          <Text style={styles.rowValue}>{owner.fullName}</Text>
          <Text style={styles.ownerUsername}>@{owner.username}</Text>
        </View>
        {editing ? null : (
          <Pressable onPress={startEditing} hitSlop={8}>
            <Text style={styles.close}>Reset password</Text>
          </Pressable>
        )}
      </View>
      {changed ? <Text style={styles.ownerNote}>Password changed</Text> : null}
      {editing ? (
        <View style={styles.ownerForm}>
          <Input
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.ownerActions}>
            <Button label="Cancel" variant="ghost" onPress={cancel} />
            <Button label="Save" onPress={save} loading={saving} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function TenantDetailsSheet({ visible, tenant, onDismiss }: Props) {
  const {
    counts,
    countsLoading,
    owners,
    ownersLoading,
    error,
    fetchCounts,
    fetchOwners,
    clearError,
  } = useTenantStore();

  useEffect(() => {
    if (visible && tenant) {
      fetchCounts(tenant.id);
      fetchOwners(tenant.id);
    }
  }, [visible, tenant, fetchCounts, fetchOwners]);

  function handleDismiss() {
    clearError();
    onDismiss();
  }

  if (!tenant) return null;

  const pending = tenant.pendingRequest;

  const accountRows: DetailRow[] = [
    { label: "Tenant code", value: tenant.tenantCode },
    { label: "Created", value: formatShortDate(tenant.createdAt) },
  ];

  const limited = tenant.pricingModel !== "unlimited";
  const subscriptionRows: DetailRow[] = [
    { label: "Pricing", value: PRICING_MODEL_LABELS[tenant.pricingModel] },
    {
      label: "Customer allowance",
      value: !limited
        ? `No limit · ${counts?.customers.active ?? 0} used`
        : counts
          ? `${tenant.customerAllowance} · ${counts.customers.active ?? 0} used`
          : String(tenant.customerAllowance),
    },
    {
      label: "Service line allowance",
      value: !limited
        ? `No limit · ${counts?.serviceLines.active ?? 0} used`
        : counts
          ? `${tenant.planAllowance} · ${counts.serviceLines.active ?? 0} used`
          : String(tenant.planAllowance),
    },
    tenant.pricingModel === "per_line"
      ? { label: "Price per service line", value: `$${tenant.pricePerPlanUsd}` }
      : { label: "Monthly price", value: dollars(tenant.fixedPriceUsd ?? 0) },
    { label: "Total Price", value: dollars(monthlyBillUsd(tenant)) },
  ];

  if (pending)
    subscriptionRows.push({
      label: "Pending request",
      value: `+${pending.requestedCount} customers / +${pending.requestedPlans} lines · ${formatShortDate(pending.createdAt)}`,
    });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tenant Details</Text>
          <Pressable onPress={handleDismiss} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{tenant.name}</Text>
            <View
              style={[
                styles.badge,
                tenant.active ? styles.badgeActive : styles.badgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  tenant.active
                    ? styles.badgeTextActive
                    : styles.badgeTextInactive,
                ]}
              >
                {tenant.active ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <Text style={styles.sectionTitle}>Account</Text>
          <DetailCard rows={accountRows} />

          <Text style={styles.sectionTitle}>Owner login</Text>
          {ownersLoading ? (
            <View style={[styles.card, styles.loadingCard]}>
              <ActivityIndicator color="#0a7ea4" />
            </View>
          ) : (
            <View style={styles.card}>
              {owners.map((owner, index) => (
                <OwnerRow key={owner.id} owner={owner} divided={index > 0} />
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Subscription</Text>
          <DetailCard rows={subscriptionRows} />

          <Text style={styles.sectionTitle}>Data</Text>
          {countsLoading || !counts ? (
            <View style={[styles.card, styles.loadingCard]}>
              <ActivityIndicator color="#0a7ea4" />
            </View>
          ) : (
            <DetailCard
              rows={COUNT_ROWS.map(({ key, label }) => ({
                label,
                value: formatCount(counts[key]),
              }))}
            />
          )}
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
  close: { fontSize: 16, color: "#0a7ea4", fontWeight: "500" },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    flex: 1,
    marginRight: 12,
  },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeActive: { backgroundColor: "#dcfce7" },
  badgeInactive: { backgroundColor: "#fee2e2" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  badgeTextActive: { color: "#16a34a" },
  badgeTextInactive: { color: "#dc2626" },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  loadingCard: { paddingVertical: 24, alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  ownerBlock: { paddingVertical: 12 },
  ownerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ownerInfo: { flexShrink: 1, marginRight: 12 },
  ownerUsername: { fontSize: 13, color: "#64748b", marginTop: 2 },
  ownerNote: {
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
    marginTop: 8,
  },
  ownerForm: { marginTop: 12 },
  ownerActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  rowDivided: { borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  rowLabel: { fontSize: 14, color: "#64748b", marginRight: 12 },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    flexShrink: 1,
    textAlign: "right",
  },
});
