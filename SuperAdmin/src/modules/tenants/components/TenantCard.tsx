import { Pressable, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatShortDate } from "@/src/core/utils/formatDate";
import type { Tenant } from "@/src/core/types";

interface TenantCardProps {
  tenant: Tenant;
  onPress: (tenant: Tenant) => void;
  onEdit: (tenant: Tenant) => void;
}

export function TenantCard({ tenant, onPress, onEdit }: TenantCardProps) {
  const pending = tenant.pendingRequest;

  return (
    <View style={styles.card}>
      <Pressable style={styles.body} onPress={() => onPress(tenant)}>
        <View style={styles.header}>
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

        <View style={styles.meta}>
          <View style={styles.allowanceBadge}>
            <Text style={styles.allowanceText}>
              {`${tenant.customerAllowance} customers · ${tenant.planAllowance} lines · $${tenant.pricePerPlanUsd} each`}
            </Text>
          </View>
          <Text style={styles.date}>{formatShortDate(tenant.createdAt)}</Text>
        </View>

        {pending ? (
          <View style={styles.requestPill}>
            <Text style={styles.requestPillText}>
              {`Requested +${pending.requestedCount} customers / +${pending.requestedPlans} lines`}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable
        style={styles.editBtn}
        onPress={() => onEdit(tenant)}
        hitSlop={8}
      >
        <IconSymbol name="pencil" size={20} color="#0a7ea4" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  body: { flex: 1, padding: 16 },
  editBtn: {
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderLeftColor: "#f1f5f9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    flex: 1,
    marginRight: 8,
  },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeActive: { backgroundColor: "#dcfce7" },
  badgeInactive: { backgroundColor: "#fee2e2" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  badgeTextActive: { color: "#16a34a" },
  badgeTextInactive: { color: "#dc2626" },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  allowanceBadge: {
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  allowanceText: { fontSize: 12, color: "#0a7ea4", fontWeight: "500" },
  date: { fontSize: 12, color: "#94a3b8" },
  requestPill: {
    alignSelf: "flex-start",
    backgroundColor: "#ffedd5",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 10,
  },
  requestPillText: { fontSize: 12, color: "#ea580c", fontWeight: "600" },
});
