import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SaasTier, Tenant } from "@/src/core/types";

interface TenantCardProps {
  tenant: Tenant;
  saasTier: SaasTier | null;
  onEdit: (tenant: Tenant) => void;
  onDelete: (tenant: Tenant) => void;
}

export function TenantCard({
  tenant,
  saasTier,
  onEdit,
  onDelete,
}: TenantCardProps) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.body} onPress={() => onEdit(tenant)}>
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
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>
              {saasTier ? `Tier: ${saasTier.name}` : "No tier assigned"}
            </Text>
          </View>
          <Text style={styles.date}>
            {new Date(tenant.createdAt).toLocaleDateString()}
          </Text>
        </View>
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
  tierBadge: {
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tierText: { fontSize: 12, color: "#0a7ea4", fontWeight: "500" },
  date: { fontSize: 12, color: "#94a3b8" },
  deleteBtn: { paddingHorizontal: 16, paddingVertical: 20 },
  deleteText: { fontSize: 13, color: "#ef4444", fontWeight: "500" },
});
